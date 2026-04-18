import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IOscilloscope,
  OscilloscopeAcquisitionCapability,
  OscilloscopeChannelBandwidthLimit,
  OscilloscopeChannelState,
  OscilloscopeCoupling,
  OscilloscopeSweep,
  OscilloscopeTriggerCapability,
  OscilloscopeTriggerConfig,
  OscilloscopeEdgeTriggerConfig,
  TimebaseState,
  Waveform,
} from "../../facades/oscilloscope.js";
import { parseBool, parseNumberOrZero } from "./_shared/index.js";
import { type XdsProfile, XDS_DEFAULT } from "./xds-profile.js";

const COUPLING_IN: Record<string, OscilloscopeCoupling> = {
  DC: "dc",
  AC: "ac",
  GND: "gnd",
  GROUND: "gnd",
};
const COUPLING_OUT: Record<OscilloscopeCoupling, string> = {
  dc: "DC",
  ac: "AC",
  gnd: "GND",
};
const BW_IN: Record<string, OscilloscopeChannelBandwidthLimit> = {
  FULL: "off",
  OFF: "off",
  "20M": "20M",
};

/**
 * Owon XDS3000-series oscilloscope driver.
 *
 * XDS firmware speaks a narrow subset of the standard SCPI scope tree:
 * channels, timebase, edge trigger, run/stop, single, and waveform
 * download. Deep features (decoders, references, history, math SCPI,
 * advanced trigger types) are **not** exposed on the wire and are
 * therefore not advertised on the facade — the UI hides their tabs
 * automatically because the capability fields are undefined.
 *
 * Waveform-download path:
 *   `:WAVeform:SOURce CHn`
 *   `:WAVeform:DATA?` → IEEE 488.2 block of signed 8-bit samples on
 *     XDS3000 (vs. 16-bit on Keysight / Siglent HD). We convert via
 *     the preamble's y-multiplier.
 *
 * The driver is deliberately conservative about catching errors — XDS
 * firmware is known to silently drop commands rather than reply with
 * `-113 Undefined header`, so timeouts are treated as "no data" rather
 * than as hard failures.
 */
export class OwonXds implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: XdsProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: XdsProfile = XDS_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from(
      { length: profile.channels },
      (_, i) => i + 1,
    );
    const sources = this.#channelIds.map((c) => `CHANnel${c}`);
    this.trigger = {
      // XDS exposes edge reliably; pulse/slope SCPI is inconsistent across
      // firmware drops and is treated as a backlog promotion.
      types: ["edge"],
      sources: [...sources, "EXT"],
      couplings: ["dc", "ac"],
      sweepModes: ["auto", "normal", "single"],
      holdoffRangeSec: { min: 1e-7, max: 10 },
      supportsForce: true,
    };
    this.acquisition = {
      modes: ["normal", "peakDetect", "average"],
      averagesRange: { min: 2, max: 128 },
      memoryDepths: ["auto", "1k", "10k", "100k", "1M", "10M"],
      supportsAutoset: true,
    };
  }

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(
      `:CHANnel${channel}:DISPlay ${enabled ? "ON" : "OFF"}`,
    );
  }

  async setChannelScale(channel: number, volts: number): Promise<void> {
    await this.port.write(`:CHANnel${channel}:SCALe ${volts}`);
  }

  async setChannelOffset(channel: number, volts: number): Promise<void> {
    await this.port.write(`:CHANnel${channel}:OFFSet ${volts}`);
  }

  async setChannelCoupling(
    channel: number,
    coupling: OscilloscopeCoupling,
  ): Promise<void> {
    await this.port.write(
      `:CHANnel${channel}:COUPling ${COUPLING_OUT[coupling]}`,
    );
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scaleRaw, posRaw] = await Promise.all([
      this.port.query(":HORIzontal:SCALe?"),
      this.port.query(":HORIzontal:POSition?"),
    ]);
    return {
      scale: parseNumberOrZero(scaleRaw) || 1e-3,
      position: parseNumberOrZero(posRaw),
    };
  }

  async setTimebase(settings: Partial<TimebaseState>): Promise<void> {
    if (settings.scale !== undefined) {
      await this.port.write(`:HORIzontal:SCALe ${settings.scale}`);
    }
    if (settings.position !== undefined) {
      await this.port.write(`:HORIzontal:POSition ${settings.position}`);
    }
  }

  async run(): Promise<void> {
    await this.port.write(":RUN");
  }

  async stop(): Promise<void> {
    await this.port.write(":STOP");
  }

  async autoset(): Promise<void> {
    await this.port.write(":AUToset");
  }

  async singleCapture(): Promise<void> {
    await this.port.write(":ACQuire:SINGLE");
  }

  async forceTrigger(): Promise<void> {
    // XDS uses `:TRIGger:SWEep SINGle; :RUN` to force a sweep; the
    // modern firmware also accepts `:TRIG:FORCe`.
    try {
      await this.port.write(":TRIGger:FORCe");
    } catch {
      await this.port.write(":TRIGger:SWEep SINGle");
      await this.port.write(":RUN");
    }
  }

  async getSweep(): Promise<OscilloscopeSweep> {
    try {
      const raw = await this.port.query(":TRIGger:SWEep?");
      const v = raw.trim().toUpperCase();
      if (v.startsWith("NORM")) return "normal";
      if (v.startsWith("SING")) return "single";
      return "auto";
    } catch {
      return "auto";
    }
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    const cmd = mode === "auto" ? "AUTO" : mode === "single" ? "SINGle" : "NORMal";
    await this.port.write(`:TRIGger:SWEep ${cmd}`);
  }

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const [srcRaw, slopeRaw, levelRaw] = await Promise.all([
      this.port.query(":TRIGger:EDGE:SOURce?"),
      this.port.query(":TRIGger:EDGE:SLOPe?"),
      this.port.query(":TRIGger:EDGE:LEVel?"),
    ]);
    const slope = slopeRaw.trim().toUpperCase();
    const cfg: OscilloscopeEdgeTriggerConfig = {
      type: "edge",
      source: srcRaw.trim() || "CHANnel1",
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
    if (config.type !== "edge") {
      // The driver only advertises edge; silently drop advanced types.
      return;
    }
    await this.port.write(`:TRIGger:EDGE:SOURce ${config.source}`);
    const slope =
      config.slope === "rising" ? "POSitive" : config.slope === "falling" ? "NEGative" : "EITHer";
    await this.port.write(`:TRIGger:EDGE:SLOPe ${slope}`);
    await this.port.write(`:TRIGger:EDGE:LEVel ${config.level}`);
  }

  async readWaveform(channel: number): Promise<Waveform> {
    try {
      await this.port.write(`:WAVeform:SOURce CHANnel${channel}`);
      let xIncrement = 1e-6;
      let xOrigin = 0;
      let yMult = 1;
      let yOffset = 0;
      try {
        const preamble = await this.port.query(":WAVeform:PREamble?");
        const parts = preamble.split(",").map((s) => Number.parseFloat(s));
        xIncrement = finiteOr(parts[4], 1e-6);
        xOrigin = finiteOr(parts[5], 0);
        yMult = finiteOr(parts[7], 1);
        yOffset = finiteOr(parts[9], 0);
      } catch {
        /* XDS firmwares without :WAV:PRE? fall back to unity scaling. */
      }
      const block = await this.port.queryBinary(":WAVeform:DATA?");
      const length = block.length;
      const y = new Float64Array(length);
      const x = new Float64Array(length);
      for (let i = 0; i < length; i += 1) {
        // XDS8-bit samples are emitted as unsigned bytes centred on 128.
        const sample = (block[i] ?? 128) - 128;
        y[i] = sample * yMult + yOffset;
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
    const [dispRaw, scaleRaw, offsetRaw, coupRaw, probeRaw, bwRaw] = await Promise.all([
      safeQuery(this.port, `:CHANnel${id}:DISPlay?`),
      safeQuery(this.port, `:CHANnel${id}:SCALe?`),
      safeQuery(this.port, `:CHANnel${id}:OFFSet?`),
      safeQuery(this.port, `:CHANnel${id}:COUPling?`),
      safeQuery(this.port, `:CHANnel${id}:PROBe?`),
      safeQuery(this.port, `:CHANnel${id}:BWLimit?`),
    ]);
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(dispRaw),
      scale: parseNumberOrZero(scaleRaw) || 1,
      offset: parseNumberOrZero(offsetRaw),
      coupling: COUPLING_IN[coupRaw.trim().toUpperCase()] ?? "dc",
      probeAttenuation: parseNumberOrZero(probeRaw) || 1,
      bandwidthLimit: BW_IN[bwRaw.trim().toUpperCase()] ?? undefined,
    };
  }
}

async function safeQuery(port: ScpiPort, cmd: string): Promise<string> {
  try {
    return await port.query(cmd);
  } catch {
    return "";
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
