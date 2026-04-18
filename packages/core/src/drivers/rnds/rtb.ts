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
import { type RtbProfile, RTB_DEFAULT } from "./rtb-profile.js";

const COUPLING_IN: Record<string, OscilloscopeCoupling> = {
  DC: "dc",
  DCL: "dc",
  AC: "ac",
  ACL: "ac",
  GND: "gnd",
};
const COUPLING_OUT: Record<OscilloscopeCoupling, string> = {
  dc: "DCLimit",
  ac: "ACLimit",
  gnd: "GND",
};

/**
 * Rohde & Schwarz RTB / RTM / RTA / MXO / HMO oscilloscope driver.
 *
 * Channel, timebase, trigger, and acquisition trees match the R&S
 * programmer manual (cross-referenced between the RTB2000 manual rev.
 * 09 and the MXO 4 manual rev. 04). The HMO legacy firmware speaks
 * the same dialect, with the exception that the binary
 * `CHANnel<n>:DATA?` path returns 8-bit samples.
 *
 * Waveform download:
 *   `CHANnel<n>:DATA:POINts?` → record length
 *   `CHANnel<n>:DATA:HEADer?` → `<xStart>,<xStop>,<length>,<vpi>`
 *   `CHANnel<n>:DATA?`        → IEEE 488.2 definite-length block of
 *   big-endian signed integers (width per profile.sampleWidth).
 */
export class RndsRtb implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: RtbProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: RtbProfile = RTB_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);
    const sources = this.#channelIds.map((c) => `CH${c}`);
    this.trigger = {
      types: ["edge"],
      sources: [...sources, "EXT", "LINE"],
      couplings: ["dc", "ac"],
      sweepModes: ["auto", "normal", "single"],
      holdoffRangeSec: { min: 1e-6, max: 10 },
      supportsForce: true,
    };
    this.acquisition = {
      modes: ["normal", "peakDetect", "average", "highResolution"],
      averagesRange: { min: 2, max: 1024 },
      memoryDepths: ["auto"],
      supportsAutoset: true,
    };
  }

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`CHANnel${channel}:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setChannelScale(channel: number, volts: number): Promise<void> {
    await this.port.write(`CHANnel${channel}:SCALe ${volts}`);
  }

  async setChannelOffset(channel: number, volts: number): Promise<void> {
    await this.port.write(`CHANnel${channel}:OFFSet ${volts}`);
  }

  async setChannelCoupling(
    channel: number,
    coupling: OscilloscopeCoupling,
  ): Promise<void> {
    await this.port.write(`CHANnel${channel}:COUPling ${COUPLING_OUT[coupling]}`);
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scaleRaw, posRaw] = await Promise.all([
      safeQuery(this.port, "TIMebase:SCALe?"),
      safeQuery(this.port, "TIMebase:POSition?"),
    ]);
    return {
      scale: parseNumberOrZero(scaleRaw) || 1e-6,
      position: parseNumberOrZero(posRaw),
    };
  }

  async setTimebase(settings: Partial<TimebaseState>): Promise<void> {
    if (settings.scale !== undefined) {
      await this.port.write(`TIMebase:SCALe ${settings.scale}`);
    }
    if (settings.position !== undefined) {
      await this.port.write(`TIMebase:POSition ${settings.position}`);
    }
  }

  async run(): Promise<void> {
    await this.port.write("RUN");
  }

  async stop(): Promise<void> {
    await this.port.write("STOP");
  }

  async autoset(): Promise<void> {
    await this.port.write("AUToscale");
  }

  async singleCapture(): Promise<void> {
    await this.port.write("SINGle");
  }

  async forceTrigger(): Promise<void> {
    await this.port.write("TRIGger:A:FORCe");
  }

  async getSweep(): Promise<OscilloscopeSweep> {
    const raw = await safeQuery(this.port, "TRIGger:A:MODe?");
    const v = raw.trim().toUpperCase();
    if (v.startsWith("NORM")) return "normal";
    return "auto";
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    if (mode === "single") {
      await this.port.write("SINGle");
      return;
    }
    await this.port.write(`TRIGger:A:MODe ${mode === "normal" ? "NORMal" : "AUTO"}`);
  }

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const [srcRaw, slopeRaw, levelRaw] = await Promise.all([
      safeQuery(this.port, "TRIGger:A:SOURce?"),
      safeQuery(this.port, "TRIGger:A:EDGE:SLOPe?"),
      safeQuery(this.port, "TRIGger:A:LEVel1?"),
    ]);
    const slope = slopeRaw.trim().toUpperCase();
    const cfg: OscilloscopeEdgeTriggerConfig = {
      type: "edge",
      source: srcRaw.trim() || "CH1",
      slope: slope.startsWith("POS") || slope.startsWith("RIS")
        ? "rising"
        : slope.startsWith("NEG") || slope.startsWith("FALL")
          ? "falling"
          : "either",
      level: parseNumberOrZero(levelRaw),
    };
    return cfg;
  }

  async setTriggerConfig(config: OscilloscopeTriggerConfig): Promise<void> {
    if (config.type !== "edge") return;
    await this.port.write(`TRIGger:A:SOURce ${config.source}`);
    const slope =
      config.slope === "rising"
        ? "POSitive"
        : config.slope === "falling"
          ? "NEGative"
          : "EITHer";
    await this.port.write(`TRIGger:A:EDGE:SLOPe ${slope}`);
    await this.port.write(`TRIGger:A:LEVel1 ${config.level}`);
  }

  async readWaveform(channel: number): Promise<Waveform> {
    try {
      const headerRaw = await safeQuery(
        this.port,
        `CHANnel${channel}:DATA:HEADer?`,
      );
      const [xStartRaw, xStopRaw, recordRaw] = headerRaw.split(",");
      const xStart = parseNumberOrZero(xStartRaw ?? "");
      const xStop = parseNumberOrZero(xStopRaw ?? "");
      const record = Math.max(
        1,
        Math.round(parseNumberOrZero(recordRaw ?? "")) || 1,
      );
      const xIncrement = record > 1 ? (xStop - xStart) / (record - 1) : 0;

      const block = await this.port.queryBinary(`CHANnel${channel}:DATA?`);
      const width = this.profile.sampleWidth;
      const length = Math.floor(block.length / width);
      const y = new Float64Array(length);
      const x = new Float64Array(length);

      // R&S returns already-scaled floating-point values packed as big-
      // endian signed integers of the chosen width. For our canonical
      // Waveform shape we convert to volts using `CHANnel<n>:SCALe` +
      // `:OFFSet` (already applied by the instrument — here we pass the
      // raw sample through a tiny normalisation so the UI shows the
      // correct divisions).
      for (let i = 0; i < length; i += 1) {
        let sample: number;
        if (width === 2) {
          const hi = block[i * 2] ?? 0;
          const lo = block[i * 2 + 1] ?? 0;
          const unsigned = (hi << 8) | lo;
          sample = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
          // R&S scope returns `:FORMat ASCii,16` or `REAL,32` variants;
          // we assume `INT,16` here and normalise on full-scale.
          y[i] = sample / 32768;
        } else {
          const raw = block[i] ?? 0;
          sample = raw >= 0x80 ? raw - 0x100 : raw;
          y[i] = sample / 128;
        }
        x[i] = xStart + i * xIncrement;
      }
      return {
        channel,
        x,
        y,
        xIncrement,
        xOrigin: xStart,
        capturedAt: Date.now(),
      };
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
    const [stateRaw, scaleRaw, offsetRaw, coupRaw] = await Promise.all([
      safeQuery(this.port, `CHANnel${id}:STATe?`),
      safeQuery(this.port, `CHANnel${id}:SCALe?`),
      safeQuery(this.port, `CHANnel${id}:OFFSet?`),
      safeQuery(this.port, `CHANnel${id}:COUPling?`),
    ]);
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(stateRaw),
      scale: parseNumberOrZero(scaleRaw) || 1,
      offset: parseNumberOrZero(offsetRaw),
      coupling:
        COUPLING_IN[coupRaw.trim().toUpperCase().replace(/LIMIT$/, "L")] ?? "dc",
      probeAttenuation: 1,
    };
  }
}
