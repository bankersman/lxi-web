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
import { type MsoProfile, MSO_DEFAULT } from "./mso-profile.js";

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
 * Tektronix MSO / DPO / MDO / 5 Series / 6 Series driver.
 *
 * The SCPI tree matches the TBS driver for channels and triggers; the
 * notable difference is the **binary `WFMOutpre?` waveform path**:
 *
 *   `DATa:SOUrce CH<n>; :DATa:ENCdg RIBinary; :DATa:WIDth <1|2>`
 *   → `WFMOutpre:XINcr?`, `:XZEro?`, `:YMUlt?`, `:YOFf?`, `:YZEro?`
 *   → `CURVe?` returns an IEEE 488.2 definite-length block of big-endian
 *     signed integers (profile.sampleWidth selects 8- or 16-bit).
 *
 * The driver advertises `trigger` (edge) + `acquisition` on the base
 * facade. Decoders / digital channels / RF input are profile-gated and
 * surfaced through the driver's `profile` accessor so the downstream
 * capability composition (4.5 SA facade for MDO RF) can light up the
 * right UI modules.
 */
export class TektronixMso implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: MsoProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: MsoProfile = MSO_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);
    const sources = this.#channelIds.map((c) => `CH${c}`);
    this.trigger = {
      types: ["edge"],
      sources: [...sources, "EXT", "LINE", "AUX"],
      couplings: ["dc", "ac"],
      sweepModes: ["auto", "normal", "single"],
      holdoffRangeSec: { min: 1.5e-6, max: 10 },
      supportsForce: true,
    };
    this.acquisition = {
      modes: ["normal", "peakDetect", "average", "highResolution"],
      averagesRange: { min: 2, max: 10_000 },
      memoryDepths: ["auto"],
      supportsAutoset: true,
    };
  }

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`DISplay:GLObal:CH${channel}:STATE ${enabled ? "ON" : "OFF"}`);
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
      scale: parseNumberOrZero(scaleRaw) || 1e-6,
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
    return "auto";
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
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
      await this.port.write("DATa:ENCdg RIBinary");
      await this.port.write(`DATa:WIDth ${this.profile.sampleWidth}`);

      const [xincrRaw, xzeroRaw, ymultRaw, yoffRaw, yzeroRaw] = await Promise.all([
        safeQuery(this.port, "WFMOutpre:XINcr?"),
        safeQuery(this.port, "WFMOutpre:XZEro?"),
        safeQuery(this.port, "WFMOutpre:YMUlt?"),
        safeQuery(this.port, "WFMOutpre:YOFf?"),
        safeQuery(this.port, "WFMOutpre:YZEro?"),
      ]);
      const xIncrement = parseNumberOrZero(xincrRaw) || 1e-9;
      const xOrigin = parseNumberOrZero(xzeroRaw);
      const yMult = parseNumberOrZero(ymultRaw) || 1;
      const yOffset = parseNumberOrZero(yoffRaw);
      const yZero = parseNumberOrZero(yzeroRaw);

      const block = await this.port.queryBinary("CURVe?");
      const width = this.profile.sampleWidth;
      const length = Math.floor(block.length / width);
      const y = new Float64Array(length);
      const x = new Float64Array(length);

      for (let i = 0; i < length; i += 1) {
        let sample: number;
        if (width === 2) {
          const hi = block[i * 2] ?? 0;
          const lo = block[i * 2 + 1] ?? 0;
          // Big-endian signed 16-bit — Tektronix RIBinary.
          const unsigned = (hi << 8) | lo;
          sample = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
        } else {
          const raw = block[i] ?? 0;
          sample = raw >= 0x80 ? raw - 0x100 : raw;
        }
        y[i] = (sample - yOffset) * yMult + yZero;
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
      safeQuery(this.port, `DISplay:GLObal:CH${id}:STATE?`),
      safeQuery(this.port, `CH${id}:SCAle?`),
      safeQuery(this.port, `CH${id}:OFFSet?`),
      safeQuery(this.port, `CH${id}:COUPling?`),
      safeQuery(this.port, `CH${id}:PRObe:GAIN?`),
    ]);
    const probeGain = parseNumberOrZero(probeRaw);
    const attenuation = probeGain > 0 ? 1 / probeGain : 1;
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(dispRaw),
      scale: parseNumberOrZero(scaleRaw) || 1,
      offset: parseNumberOrZero(offsetRaw),
      coupling: COUPLING_IN[coupRaw.trim().toUpperCase()] ?? "dc",
      probeAttenuation: attenuation,
    };
  }
}
