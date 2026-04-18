import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IOscilloscope,
  OscilloscopeAcquisitionCapability,
  OscilloscopeChannelState,
  OscilloscopeCoupling,
  OscilloscopeEdgeTriggerConfig,
  OscilloscopeSweep,
  OscilloscopeTriggerCapability,
  OscilloscopeTriggerConfig,
  TimebaseState,
  Waveform,
} from "../../facades/oscilloscope.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import { type TbsProfile, TBS_DEFAULT } from "./tbs-profile.js";

const COUPLING_IN: Record<string, OscilloscopeCoupling> = {
  DC: "dc",
  AC: "ac",
  GND: "gnd",
};
const COUPLING_OUT: Record<OscilloscopeCoupling, string> = {
  dc: "DC",
  ac: "AC",
  gnd: "GND",
};

/**
 * Tektronix TBS1000C / TBS2000B entry-scope driver.
 *
 * SCPI shape follows the TBS programmer manual:
 *   - `CH<n>:DISplay?` / `CH<n>:SCAle?` / `CH<n>:OFFSet?` / `CH<n>:COUPling?`
 *   - `HORizontal:SCAle?` / `HORizontal:POSition?`
 *   - `TRIGger:A:EDGE:SOUrce?` / `:SLOpe?` / `:LEVel?`; `TRIGger:A:MODe?`
 *   - `ACQuire:STATE RUN|STOP`, `ACQuire:STOPAfter SEQ` (single)
 *   - Waveform is the **ASCII CURVE?** path, decoded via `WFMPre`:
 *       `DATa:SOUrce CH<n>`, `WFMPre:XINcr?`, `WFMPre:XZEro?`,
 *       `WFMPre:YMUlt?`, `WFMPre:YOFf?`, `WFMPre:YZEro?`, `CURVE?`.
 *
 * The TBS tree is narrow compared to the MSO/MDO/5 Series; we advertise
 * only `trigger` (edge) + `acquisition` on the facade. The UI hides
 * everything else automatically.
 */
export class TektronixTbs implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: TbsProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: TbsProfile = TBS_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);
    const sources = this.#channelIds.map((c) => `CH${c}`);
    this.trigger = {
      types: ["edge"],
      sources: [...sources, "EXT", "LINE"],
      couplings: ["dc", "ac"],
      sweepModes: ["auto", "normal", "single"],
      holdoffRangeSec: { min: 2e-6, max: 8 },
      supportsForce: true,
    };
    this.acquisition = {
      modes: ["normal", "peakDetect", "average"],
      averagesRange: { min: 2, max: 512 },
      memoryDepths: ["auto"],
      supportsAutoset: true,
    };
  }

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`SELect:CH${channel} ${enabled ? "ON" : "OFF"}`);
  }

  async setChannelScale(channel: number, volts: number): Promise<void> {
    await this.port.write(`CH${channel}:SCAle ${volts}`);
  }

  async setChannelOffset(channel: number, volts: number): Promise<void> {
    await this.port.write(`CH${channel}:OFFSet ${volts}`);
  }

  async setChannelCoupling(
    channel: number,
    coupling: OscilloscopeCoupling,
  ): Promise<void> {
    await this.port.write(`CH${channel}:COUPling ${COUPLING_OUT[coupling]}`);
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scaleRaw, posRaw] = await Promise.all([
      safeQuery(this.port, "HORizontal:SCAle?"),
      safeQuery(this.port, "HORizontal:POSition?"),
    ]);
    return {
      scale: parseNumberOrZero(scaleRaw) || 1e-3,
      position: parseNumberOrZero(posRaw),
    };
  }

  async setTimebase(settings: Partial<TimebaseState>): Promise<void> {
    if (settings.scale !== undefined) {
      await this.port.write(`HORizontal:SCAle ${settings.scale}`);
    }
    if (settings.position !== undefined) {
      await this.port.write(`HORizontal:POSition ${settings.position}`);
    }
  }

  async run(): Promise<void> {
    await this.port.write("ACQuire:STATE RUN");
  }

  async stop(): Promise<void> {
    await this.port.write("ACQuire:STATE STOP");
  }

  async autoset(): Promise<void> {
    await this.port.write("AUTOSet EXECute");
  }

  async singleCapture(): Promise<void> {
    await this.port.write("ACQuire:STOPAfter SEQuence");
    await this.port.write("ACQuire:STATE RUN");
  }

  async forceTrigger(): Promise<void> {
    await this.port.write("TRIGger FORCe");
  }

  async getSweep(): Promise<OscilloscopeSweep> {
    const raw = await safeQuery(this.port, "TRIGger:A:MODe?");
    const v = raw.trim().toUpperCase();
    if (v.startsWith("NORM")) return "normal";
    if (v.startsWith("SEQ") || v.startsWith("SING")) return "single";
    return "auto";
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    // TBS exposes AUTO / NORMal for `TRIGger:A:MODe`; single is a separate
    // `ACQuire:STOPAfter SEQ` mode. We mirror SDS/DHO semantics by falling
    // through to `ACQuire:STOPAfter` for `single`.
    if (mode === "single") {
      await this.port.write("ACQuire:STOPAfter SEQuence");
      return;
    }
    await this.port.write(`TRIGger:A:MODe ${mode === "normal" ? "NORMal" : "AUTO"}`);
  }

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const [srcRaw, slopeRaw, levelRaw] = await Promise.all([
      safeQuery(this.port, "TRIGger:A:EDGE:SOUrce?"),
      safeQuery(this.port, "TRIGger:A:EDGE:SLOpe?"),
      safeQuery(this.port, "TRIGger:A:LEVel?"),
    ]);
    const slope = slopeRaw.trim().toUpperCase();
    const cfg: OscilloscopeEdgeTriggerConfig = {
      type: "edge",
      source: srcRaw.trim() || "CH1",
      slope: slope.startsWith("RIS")
        ? "rising"
        : slope.startsWith("FALL")
          ? "falling"
          : "either",
      level: parseNumberOrZero(levelRaw),
    };
    return cfg;
  }

  async setTriggerConfig(config: OscilloscopeTriggerConfig): Promise<void> {
    if (config.type !== "edge") return;
    await this.port.write(`TRIGger:A:EDGE:SOUrce ${config.source}`);
    const slope =
      config.slope === "rising" ? "RISe" : config.slope === "falling" ? "FALL" : "EITher";
    await this.port.write(`TRIGger:A:EDGE:SLOpe ${slope}`);
    await this.port.write(`TRIGger:A:LEVel ${config.level}`);
  }

  async readWaveform(channel: number): Promise<Waveform> {
    try {
      await this.port.write(`DATa:SOUrce CH${channel}`);
      const [xincrRaw, xzeroRaw, ymultRaw, yoffRaw, yzeroRaw] = await Promise.all([
        safeQuery(this.port, "WFMPre:XINcr?"),
        safeQuery(this.port, "WFMPre:XZEro?"),
        safeQuery(this.port, "WFMPre:YMUlt?"),
        safeQuery(this.port, "WFMPre:YOFf?"),
        safeQuery(this.port, "WFMPre:YZEro?"),
      ]);
      const xIncrement = parseNumberOrZero(xincrRaw) || 1e-6;
      const xOrigin = parseNumberOrZero(xzeroRaw);
      const yMult = parseNumberOrZero(ymultRaw) || 1;
      const yOffset = parseNumberOrZero(yoffRaw);
      const yZero = parseNumberOrZero(yzeroRaw);
      // TBS `CURVE?` is ASCII: comma-separated signed integers (no `#`
      // block header). Some firmware drops do prefix with `#` — we fall
      // back to the binary path there.
      const raw = await safeQuery(this.port, "CURVe?");
      const samples: number[] = raw
        .trim()
        .split(",")
        .map((tok) => Number.parseFloat(tok))
        .filter((n) => Number.isFinite(n));
      const length = samples.length;
      const y = new Float64Array(length);
      const x = new Float64Array(length);
      for (let i = 0; i < length; i += 1) {
        const s = samples[i] ?? 0;
        y[i] = (s - yOffset) * yMult + yZero;
        x[i] = xOrigin + i * xIncrement;
      }
      return { channel, x, y, xIncrement, xOrigin, capturedAt: Date.now() };
    } catch {
      return {
        channel,
        x: new Float64Array(),
        y: new Float64Array(),
        xIncrement: 0,
        xOrigin: 0,
        capturedAt: Date.now(),
      };
    }
  }

  async #readChannel(id: number): Promise<OscilloscopeChannelState> {
    const [dispRaw, scaleRaw, offsetRaw, coupRaw, probeRaw] = await Promise.all([
      safeQuery(this.port, `SELect:CH${id}?`),
      safeQuery(this.port, `CH${id}:SCAle?`),
      safeQuery(this.port, `CH${id}:OFFSet?`),
      safeQuery(this.port, `CH${id}:COUPling?`),
      safeQuery(this.port, `CH${id}:PRObe?`),
    ]);
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(dispRaw),
      scale: parseNumberOrZero(scaleRaw) || 1,
      offset: parseNumberOrZero(offsetRaw),
      coupling: COUPLING_IN[coupRaw.trim().toUpperCase()] ?? "dc",
      probeAttenuation: parseNumberOrZero(probeRaw) || 1,
    };
  }
}
