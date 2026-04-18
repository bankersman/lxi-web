import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { InstrumentPresetCapability } from "../../facades/multimeter.js";
import type {
  IOscilloscope,
  OscilloscopeAcquisitionCapability,
  OscilloscopeAcquisitionConfig,
  OscilloscopeAcquisitionMode,
  OscilloscopeChannelBandwidthLimit,
  OscilloscopeChannelState,
  OscilloscopeChannelUnit,
  OscilloscopeCoupling,
  OscilloscopeDisplayCapability,
  OscilloscopeDisplayPersistence,
  OscilloscopeMemoryDepth,
  OscilloscopeScreenshot,
  OscilloscopeScreenshotFormat,
  OscilloscopeSweep,
  OscilloscopeTriggerCapability,
  OscilloscopeTriggerConfig,
  OscilloscopeEdgeTriggerConfig,
  TimebaseState,
  Waveform,
} from "../../facades/oscilloscope.js";
import { parseBool } from "./_shared/index.js";
import {
  type InfiniiVisionProfile,
  INFINIIVISION_DEFAULT,
} from "./infiniivision-profile.js";

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

function memoryDepthLabel(n: number): OscilloscopeMemoryDepth {
  if (n >= 25e6) return "25M";
  if (n >= 10e6) return "10M";
  if (n >= 1e6) return "1M";
  if (n >= 100e3) return "100k";
  if (n >= 10e3) return "10k";
  if (n >= 1e3) return "1k";
  return "auto";
}

const DEFAULT_DISPLAY: OscilloscopeDisplayCapability = {
  screenshotFormats: ["png", "bmp"],
  persistenceOptions: ["min", "0.1s", "0.2s", "0.5s", "1s", "5s", "10s", "infinite"],
};

/**
 * Keysight InfiniiVision driver — 1000X / 2000X / 3000T / 4000X / 6000X.
 *
 * SCPI dialect (InfiniiVision Programmer's Reference):
 *   - Channel shape: `:CHANnel<n>:DISPlay`, `:SCALe`, `:OFFSet`,
 *     `:COUPling DC|AC`, `:BWLimit ON|OFF` (there is only a 20 MHz
 *     limit on InfiniiVision — `200M` profile values on 4000X/6000X
 *     are the natural bandwidth; we surface `off`/`20M` only).
 *   - Timebase: `:TIMebase:SCALe`, `:TIMebase:POSition` (position, not
 *     delay).
 *   - Trigger: `:TRIGger:MODE EDGE|GLIT|...`, `:TRIGger:SWEep AUTO|NORMal`,
 *     `:TRIGger:EDGE:SOURce CHAN<n>|EXT|LINE`,
 *     `:TRIGger:EDGE:SLOPe POS|NEG|EITH|ALT`,
 *     `:TRIGger:EDGE:LEVel`.
 *   - Acquisition: `:ACQuire:TYPE NORMal|AVERage|HRESolution|PEAK`,
 *     `:ACQuire:COUNt <N>` for the averaging count.
 *   - Waveform: `:WAVeform:SOURce CHANnel<n>`, `:WAVeform:FORMat WORD`,
 *     `:WAVeform:POINts`, `:WAVeform:DATA?`, `:WAVeform:PREamble?`
 *     — preamble layout: format,type,points,count,xinc,xorg,xref,
 *     yinc,yorg,yref. We use the 10-field preamble to scale samples.
 *   - Screenshot: `:DISPlay:DATA? <PNG|BMP>` returns IEEE binary.
 *   - Run / stop: `:RUN`, `:STOP`, `:SINGle`, `:AUToscale`.
 */
export class KeysightInfiniiVision implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: InfiniiVisionProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;
  readonly display = DEFAULT_DISPLAY;
  readonly presets: InstrumentPresetCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: InfiniiVisionProfile = INFINIIVISION_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);

    const sources = this.#channelIds.map((c) => `CHANnel${c}`);
    this.trigger = {
      types: ["edge", "pulse", "slope", "video", "runt", "window"],
      sources: [...sources, "EXT", "LINE"],
      couplings: ["dc", "ac", "hfReject", "lfReject", "nReject"],
      sweepModes: ["auto", "normal", "single"],
      holdoffRangeSec: { min: 2e-9, max: 10 },
      supportsForce: true,
    };

    const modes: readonly OscilloscopeAcquisitionMode[] = [
      "normal",
      "average",
      "peakDetect",
      "highResolution",
    ];
    const memoryDepthLabels: OscilloscopeMemoryDepth[] = ["auto"];
    for (const n of profile.memoryDepths) {
      const label = memoryDepthLabel(n);
      if (!memoryDepthLabels.includes(label)) memoryDepthLabels.push(label);
    }
    this.acquisition = {
      modes,
      averagesRange: { min: 2, max: 65536 },
      memoryDepths: memoryDepthLabels,
      supportsAutoset: true,
    };

    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:DISPlay ${enabled ? "ON" : "OFF"}`);
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
    // InfiniiVision doesn't support GND coupling as a first-class SCPI
    // state (the firmware accepts it on some firmwares but docs treat
    // it as DC + input-off). Map to DC so the UI stays consistent.
    const cmd = coupling === "gnd" ? "DC" : COUPLING_OUT[coupling];
    await this.port.write(`:CHANnel${channel}:COUPling ${cmd}`);
  }

  async setChannelBandwidthLimit(
    channel: number,
    limit: OscilloscopeChannelBandwidthLimit,
  ): Promise<void> {
    // InfiniiVision only has a single toggle: 20 MHz on / off. Any
    // non-off request engages the filter; "off" disables it.
    await this.port.write(
      `:CHANnel${channel}:BWLimit ${limit === "off" ? "OFF" : "ON"}`,
    );
  }

  async setChannelInvert(channel: number, invert: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:INVert ${invert ? "ON" : "OFF"}`);
  }

  async setChannelUnit(channel: number, unit: OscilloscopeChannelUnit): Promise<void> {
    await this.port.write(
      `:CHANnel${channel}:UNITs ${unit === "A" ? "AMPere" : "VOLT"}`,
    );
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scaleRaw, posRaw] = await Promise.all([
      this.port.query(":TIMebase:SCALe?"),
      this.port.query(":TIMebase:POSition?"),
    ]);
    return {
      scale: Number.parseFloat(scaleRaw) || 1e-3,
      position: Number.parseFloat(posRaw) || 0,
    };
  }

  async setTimebase(settings: Partial<TimebaseState>): Promise<void> {
    if (settings.scale !== undefined) {
      await this.port.write(`:TIMebase:SCALe ${settings.scale}`);
    }
    if (settings.position !== undefined) {
      await this.port.write(`:TIMebase:POSition ${settings.position}`);
    }
  }

  async getSweep(): Promise<OscilloscopeSweep> {
    const raw = await this.port.query(":TRIGger:SWEep?");
    const v = raw.trim().toUpperCase();
    if (v.startsWith("NORM")) return "normal";
    return "auto";
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    if (mode === "single") {
      await this.port.write(":SINGle");
      return;
    }
    await this.port.write(`:TRIGger:SWEep ${mode === "auto" ? "AUTO" : "NORMal"}`);
  }

  async forceTrigger(): Promise<void> {
    await this.port.write(":TRIGger:FORCe");
  }

  async singleCapture(): Promise<void> {
    await this.port.write(":SINGle");
  }

  async run(): Promise<void> {
    await this.port.write(":RUN");
  }

  async stop(): Promise<void> {
    await this.port.write(":STOP");
  }

  async autoset(): Promise<void> {
    await this.port.write(":AUToscale");
  }

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const [typeRaw, srcRaw, slopeRaw, levelRaw] = await Promise.all([
      this.port.query(":TRIGger:MODE?"),
      this.port.query(":TRIGger:EDGE:SOURce?"),
      this.port.query(":TRIGger:EDGE:SLOPe?"),
      this.port.query(":TRIGger:EDGE:LEVel?"),
    ]);
    const typeUp = typeRaw.trim().toUpperCase();
    const baseSource = srcRaw.trim() || "CHANnel1";
    const level = Number.parseFloat(levelRaw) || 0;
    if (typeUp.startsWith("EDGE")) {
      const slope = slopeRaw.trim().toUpperCase();
      const cfg: OscilloscopeEdgeTriggerConfig = {
        type: "edge",
        source: baseSource,
        slope: slope.startsWith("POS")
          ? "rising"
          : slope.startsWith("NEG")
            ? "falling"
            : "either",
        level,
      };
      return cfg;
    }
    return {
      type: "edge",
      source: baseSource,
      slope: "rising",
      level,
    };
  }

  async setTriggerConfig(config: OscilloscopeTriggerConfig): Promise<void> {
    if (config.type !== "edge") {
      await this.port.write(`:TRIGger:MODE ${config.type.toUpperCase()}`);
      return;
    }
    await this.port.write(":TRIGger:MODE EDGE");
    await this.port.write(`:TRIGger:EDGE:SOURce ${config.source}`);
    await this.port.write(
      `:TRIGger:EDGE:SLOPe ${
        config.slope === "rising"
          ? "POSitive"
          : config.slope === "falling"
            ? "NEGative"
            : "EITHer"
      }`,
    );
    await this.port.write(`:TRIGger:EDGE:LEVel ${config.level}`);
  }

  async getAcquisitionConfig(): Promise<OscilloscopeAcquisitionConfig> {
    const [typeRaw, countRaw] = await Promise.all([
      this.port.query(":ACQuire:TYPE?"),
      this.port.query(":ACQuire:COUNt?"),
    ]);
    return {
      mode: decodeAcqMode(typeRaw),
      averages: Math.max(1, Math.floor(Number.parseFloat(countRaw) || 1)),
      // InfiniiVision doesn't expose a live "memory depth" query; the
      // fixed buffer is implicit from the :WAVeform:POINts setting.
      memoryDepth: "auto",
    };
  }

  async setAcquisitionConfig(config: OscilloscopeAcquisitionConfig): Promise<void> {
    await this.port.write(`:ACQuire:TYPE ${encodeAcqMode(config.mode)}`);
    if (config.mode === "average") {
      await this.port.write(`:ACQuire:COUNt ${config.averages}`);
    }
  }

  async readWaveform(channel: number): Promise<Waveform> {
    try {
      await this.port.write(`:WAVeform:SOURce CHANnel${channel}`);
      await this.port.write(":WAVeform:FORMat WORD");
      await this.port.write(":WAVeform:POINts:MODE NORMal");
      const preamble = await this.port.query(":WAVeform:PREamble?");
      const parts = preamble.split(",").map((s) => Number.parseFloat(s));
      const xIncrement = finiteOr(parts[4], 1e-6);
      const xOrigin = finiteOr(parts[5], 0);
      const yInc = finiteOr(parts[7], 1);
      const yOrg = finiteOr(parts[8], 0);
      const yRef = finiteOr(parts[9], 0);
      const block = await this.port.queryBinary(":WAVeform:DATA?");
      const samples = decodeWordSamples(block);
      const length = samples.length;
      const y = new Float64Array(length);
      const x = new Float64Array(length);
      for (let i = 0; i < length; i += 1) {
        // Keysight WORD samples scale as: value = ((raw - yRef) * yInc) + yOrg
        y[i] = ((samples[i] ?? 0) - yRef) * yInc + yOrg;
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

  async captureScreenshot(
    format: OscilloscopeScreenshotFormat,
  ): Promise<OscilloscopeScreenshot> {
    // InfiniiVision accepts `:DISPlay:DATA? <PNG|BMP>, SCReen, COLor`.
    // The driver requests the simplest form and lets the firmware
    // default the other two parameters.
    const tag = format === "png" ? "PNG" : "BMP";
    const data = await this.port.queryBinary(`:DISPlay:DATA? ${tag},SCReen,COLor`);
    return { format, data, capturedAt: Date.now() };
  }

  async getDisplayPersistence(): Promise<OscilloscopeDisplayPersistence> {
    try {
      const raw = await this.port.query(":DISPlay:PERSistence?");
      const v = raw.trim().toUpperCase();
      if (v === "INF" || v === "INFINITE" || v === "INFinite") return "infinite";
      if (v === "MIN" || v === "OFF" || v === "0") return "min";
      const n = Number.parseFloat(raw);
      if (n >= 10) return "10s";
      if (n >= 5) return "5s";
      if (n >= 1) return "1s";
      if (n >= 0.5) return "0.5s";
      if (n >= 0.2) return "0.2s";
      if (n >= 0.1) return "0.1s";
      return "min";
    } catch {
      return "min";
    }
  }

  async setDisplayPersistence(p: OscilloscopeDisplayPersistence): Promise<void> {
    if (p === "infinite") {
      await this.port.write(":DISPlay:PERSistence INFinite");
      return;
    }
    if (p === "min") {
      await this.port.write(":DISPlay:PERSistence MIN");
      return;
    }
    const seconds = p.endsWith("s") ? p.slice(0, -1) : p;
    await this.port.write(`:DISPlay:PERSistence ${seconds}`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    return Array.from({ length: this.presets.slots }, () => false);
  }

  async savePreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot}`);
  }

  async #readChannel(id: number): Promise<OscilloscopeChannelState> {
    const [enRaw, scaleRaw, offRaw, coupRaw, bwRaw, invRaw, unitRaw, probeRaw] = await Promise.all([
      this.port.query(`:CHANnel${id}:DISPlay?`),
      this.port.query(`:CHANnel${id}:SCALe?`),
      this.port.query(`:CHANnel${id}:OFFSet?`),
      this.port.query(`:CHANnel${id}:COUPling?`),
      safeQuery(this.port, `:CHANnel${id}:BWLimit?`),
      safeQuery(this.port, `:CHANnel${id}:INVert?`),
      safeQuery(this.port, `:CHANnel${id}:UNITs?`),
      safeQuery(this.port, `:CHANnel${id}:PROBe?`),
    ]);
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(enRaw),
      scale: Number.parseFloat(scaleRaw) || 1,
      offset: Number.parseFloat(offRaw) || 0,
      coupling: decodeCoupling(coupRaw),
      probeAttenuation: Number.parseFloat(probeRaw ?? "1") || 1,
      bandwidthLimit: bwRaw !== null ? (parseBool(bwRaw) ? "20M" : "off") : undefined,
      invert: invRaw !== null ? parseBool(invRaw) : false,
      unit: decodeChannelUnit(unitRaw),
    };
  }

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }
}

function decodeCoupling(raw: string): OscilloscopeCoupling {
  return COUPLING_IN[raw.trim().toUpperCase()] ?? "dc";
}

function decodeChannelUnit(raw: string | null): OscilloscopeChannelUnit {
  if (!raw) return "V";
  return raw.trim().toUpperCase().startsWith("AMP") ? "A" : "V";
}

function decodeAcqMode(raw: string): OscilloscopeAcquisitionMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("AVER")) return "average";
  if (v.startsWith("PEAK")) return "peakDetect";
  if (v.startsWith("HRES") || v.startsWith("HIG")) return "highResolution";
  return "normal";
}

function encodeAcqMode(mode: OscilloscopeAcquisitionMode): string {
  switch (mode) {
    case "average":
      return "AVERage";
    case "peakDetect":
      return "PEAK";
    case "highResolution":
      return "HRESolution";
    default:
      return "NORMal";
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

async function safeQuery(port: ScpiPort, cmd: string): Promise<string | null> {
  try {
    return await port.query(cmd);
  } catch {
    return null;
  }
}

function decodeWordSamples(data: Uint8Array): Int32Array {
  // `:WAVeform:FORMat WORD` returns unsigned 16-bit big-endian samples.
  const out = new Int32Array(Math.floor(data.length / 2));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0, j = 0; i + 1 < data.length; i += 2, j += 1) {
    out[j] = view.getUint16(i, false);
  }
  return out;
}
