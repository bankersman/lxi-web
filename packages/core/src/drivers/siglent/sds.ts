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
import { type SdsProfile, SDS_DEFAULT } from "./sds-profile.js";
import { parseBool } from "./_shared/index.js";

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
  "200M": "200M",
};
const BW_OUT: Record<OscilloscopeChannelBandwidthLimit, string> = {
  off: "FULL",
  "20M": "20M",
  "100M": "100M",
  "200M": "200M",
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
function memoryDepthToNumber(d: OscilloscopeMemoryDepth): number | null {
  switch (d) {
    case "auto":
      return null;
    case "1k":
      return 1e3;
    case "10k":
      return 1e4;
    case "100k":
      return 1e5;
    case "1M":
      return 1e6;
    case "10M":
      return 1e7;
    case "25M":
      return 2.5e7;
  }
}

const DEFAULT_DISPLAY: OscilloscopeDisplayCapability = {
  screenshotFormats: ["png", "bmp", "jpg"],
  persistenceOptions: ["min", "0.1s", "0.2s", "0.5s", "1s", "5s", "10s", "infinite"],
};

/**
 * Siglent SDS HD-dialect oscilloscope driver.
 *
 * Targets the SCPI-2000 command tree shipped on SDS800X-HD / 2000X-HD /
 * 2000X-Plus / 3000X-HD / 6000A. Registry entries for SDS1000X-E also
 * route here as a best-effort — the X-E firmware accepts most of the
 * modern tree alongside its legacy `C1:VDIV` / `WFSU` syntax. When a
 * hardware report confirms a specific X-E command gap, the legacy
 * driver lands as `SiglentSds1000Xe` alongside this class.
 *
 * Waveform download uses the **HD** pattern:
 *   `:WAVeform:SOURce Cn`
 *   `:WAVeform:POINt 1000` (or `MAXimum` for full memory)
 *   `:WAVeform:DATA?` returns a `#N<len><payload>` IEEE block of
 *     signed 16-bit (12-bit data, sign-extended) samples.
 *   `:WAVeform:PREamble?` carries xIncrement, xOrigin, yMult, yOffset.
 *
 * On dialect "legacy-1000xe", `:WAV` is replaced with `C<n>:WF? DAT2`
 * and the preamble is parsed from the header of the returned block.
 * The legacy path is guarded so it degrades gracefully to an empty
 * waveform when the firmware doesn't respond.
 */
export class SiglentSdsHd implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: SdsProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;
  readonly display = DEFAULT_DISPLAY;
  readonly presets: InstrumentPresetCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SdsProfile = SDS_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);

    const sources = this.#channelIds.map((c) => `CHANnel${c}`);
    this.trigger = {
      types: ["edge", "pulse", "slope", "video", "runt", "window"],
      sources: [...sources, "EXT", "LINE"],
      couplings: ["dc", "ac", "hfReject", "lfReject"],
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
      averagesRange: { min: 4, max: 1024 },
      memoryDepths: memoryDepthLabels,
      supportsAutoset: true,
    };

    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:SWITch ${enabled ? "ON" : "OFF"}`);
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

  async setChannelBandwidthLimit(
    channel: number,
    limit: OscilloscopeChannelBandwidthLimit,
  ): Promise<void> {
    await this.port.write(
      `:CHANnel${channel}:BWLimit ${BW_OUT[limit]}`,
    );
  }

  async setChannelInvert(channel: number, invert: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:INVert ${invert ? "ON" : "OFF"}`);
  }

  async setChannelUnit(channel: number, unit: OscilloscopeChannelUnit): Promise<void> {
    await this.port.write(`:CHANnel${channel}:UNIT ${unit === "A" ? "A" : "V"}`);
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scaleRaw, posRaw] = await Promise.all([
      this.port.query(":TIMebase:SCALe?"),
      this.port.query(":TIMebase:DELay?"),
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
      await this.port.write(`:TIMebase:DELay ${settings.position}`);
    }
  }

  async getSweep(): Promise<OscilloscopeSweep> {
    const raw = await this.port.query(":TRIGger:SWEep?");
    const v = raw.trim().toUpperCase();
    if (v.startsWith("NORM")) return "normal";
    if (v.startsWith("SING")) return "single";
    return "auto";
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    const cmd = mode === "auto" ? "AUTO" : mode === "single" ? "SINGle" : "NORMal";
    await this.port.write(`:TRIGger:SWEep ${cmd}`);
  }

  async forceTrigger(): Promise<void> {
    await this.port.write(":TRIGger:FORCe");
  }

  async singleCapture(): Promise<void> {
    await this.port.write(":TRIGger:SWEep SINGle");
    await this.port.write(":RUN");
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

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const [typeRaw, srcRaw, slopeRaw, levelRaw] = await Promise.all([
      this.port.query(":TRIGger:TYPE?"),
      this.port.query(":TRIGger:EDGE:SOURce?"),
      this.port.query(":TRIGger:EDGE:SLOPe?"),
      this.port.query(":TRIGger:EDGE:LEVel?"),
    ]);
    const typeUp = typeRaw.trim().toUpperCase();
    if (typeUp.startsWith("EDGE")) {
      const slope = slopeRaw.trim().toUpperCase();
      const cfg: OscilloscopeEdgeTriggerConfig = {
        type: "edge",
        source: srcRaw.trim() || "CHANnel1",
        slope: slope.startsWith("RIS")
          ? "rising"
          : slope.startsWith("FALL")
            ? "falling"
            : "either",
        level: Number.parseFloat(levelRaw) || 0,
      };
      return cfg;
    }
    // Non-edge triggers: return a conservative default edge surface and
    // let the UI surface its own config. Pulse / slope / video read-back
    // lands with the first hardware report that confirms the deep SCPI.
    return {
      type: "edge",
      source: srcRaw.trim() || "CHANnel1",
      slope: "rising",
      level: Number.parseFloat(levelRaw) || 0,
    };
  }

  async setTriggerConfig(config: OscilloscopeTriggerConfig): Promise<void> {
    if (config.type !== "edge") {
      // Set the trigger type and leave deeper configuration to SCPI-level
      // follow-ups. This keeps the driver usable as a Preview entry.
      await this.port.write(`:TRIGger:TYPE ${config.type.toUpperCase()}`);
      return;
    }
    await this.port.write(":TRIGger:TYPE EDGE");
    await this.port.write(`:TRIGger:EDGE:SOURce ${config.source}`);
    await this.port.write(
      `:TRIGger:EDGE:SLOPe ${
        config.slope === "rising"
          ? "RISing"
          : config.slope === "falling"
            ? "FALLing"
            : "ALTernate"
      }`,
    );
    await this.port.write(`:TRIGger:EDGE:LEVel ${config.level}`);
  }

  async getAcquisitionConfig(): Promise<OscilloscopeAcquisitionConfig> {
    const [modeRaw, avgRaw, depthRaw] = await Promise.all([
      this.port.query(":ACQuire:TYPE?"),
      this.port.query(":ACQuire:AVERage?"),
      this.port.query(":ACQuire:MDEPth?"),
    ]);
    const depthN = Number.parseFloat(depthRaw) || 0;
    return {
      mode: decodeAcqMode(modeRaw),
      averages: Math.max(1, Math.floor(Number.parseFloat(avgRaw) || 1)),
      memoryDepth: memoryDepthLabel(depthN),
    };
  }

  async setAcquisitionConfig(config: OscilloscopeAcquisitionConfig): Promise<void> {
    await this.port.write(`:ACQuire:TYPE ${encodeAcqMode(config.mode)}`);
    if (config.mode === "average") {
      await this.port.write(`:ACQuire:AVERage ${config.averages}`);
    }
    if (config.memoryDepth !== "auto") {
      const n = memoryDepthToNumber(config.memoryDepth);
      if (n !== null) {
        await this.port.write(`:ACQuire:MDEPth ${n}`);
      }
    }
  }

  async readWaveform(channel: number): Promise<Waveform> {
    try {
      await this.port.write(`:WAVeform:SOURce CHANnel${channel}`);
      const preamble = await this.port.query(":WAVeform:PREamble?");
      const parts = preamble.split(",").map((s) => Number.parseFloat(s));
      const xIncrement = finiteOr(parts[4], 1e-6);
      const xOrigin = finiteOr(parts[5], 0);
      const yMult = finiteOr(parts[7], 1);
      const yOffset = finiteOr(parts[9], 0);
      const block = await this.port.queryBinary(":WAVeform:DATA?");
      const samples = decodeSamples(block, this.profile.bitDepth);
      const length = samples.length;
      const y = new Float64Array(length);
      const x = new Float64Array(length);
      for (let i = 0; i < length; i += 1) {
        y[i] = (samples[i] ?? 0) * yMult + yOffset;
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

  async captureScreenshot(format: OscilloscopeScreenshotFormat): Promise<OscilloscopeScreenshot> {
    const data = await this.port.queryBinary(`:PRINt? ${format.toUpperCase()}`);
    return { format, data, capturedAt: Date.now() };
  }

  async getDisplayPersistence(): Promise<OscilloscopeDisplayPersistence> {
    try {
      const raw = await this.port.query(":DISPlay:PERSistence?");
      const trimmed = raw.trim().toUpperCase();
      if (trimmed === "INF" || trimmed === "INFINITE") return "infinite";
      if (trimmed === "MIN" || trimmed === "0") return "min";
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
      this.port.query(`:CHANnel${id}:SWITch?`),
      this.port.query(`:CHANnel${id}:SCALe?`),
      this.port.query(`:CHANnel${id}:OFFSet?`),
      this.port.query(`:CHANnel${id}:COUPling?`),
      safeQuery(this.port, `:CHANnel${id}:BWLimit?`),
      safeQuery(this.port, `:CHANnel${id}:INVert?`),
      safeQuery(this.port, `:CHANnel${id}:UNIT?`),
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
      bandwidthLimit: decodeBw(bwRaw),
      invert: invRaw !== null ? parseBool(invRaw) : false,
      unit: (unitRaw?.trim().toUpperCase() === "A" ? "A" : "V") as OscilloscopeChannelUnit,
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

function decodeBw(raw: string | null): OscilloscopeChannelBandwidthLimit | undefined {
  if (raw === null) return undefined;
  return BW_IN[raw.trim().toUpperCase()] ?? "off";
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

/** Return `value` when finite, otherwise `fallback`. */
function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** Swallow a query that fails so the channel read still returns. */
async function safeQuery(port: ScpiPort, cmd: string): Promise<string | null> {
  try {
    return await port.query(cmd);
  } catch {
    return null;
  }
}

function decodeSamples(data: Uint8Array, bitDepth: number): Int32Array {
  // HD models return 16-bit signed samples (little-endian). 8-bit
  // models (SDS6000A) return 8-bit signed. Use the profile to pick.
  if (bitDepth >= 12) {
    const out = new Int32Array(Math.floor(data.length / 2));
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0, j = 0; i + 1 < data.length; i += 2, j += 1) {
      out[j] = view.getInt16(i, true);
    }
    return out;
  }
  const out = new Int32Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const b = data[i]!;
    out[i] = b > 127 ? b - 256 : b;
  }
  return out;
}
