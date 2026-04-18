import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IOscilloscope,
  OscilloscopeAcquisitionCapability,
  OscilloscopeChannelState,
  OscilloscopeCoupling,
  OscilloscopeDecoderCapability,
  OscilloscopeEdgeTriggerConfig,
  OscilloscopeSweep,
  OscilloscopeTriggerCapability,
  OscilloscopeTriggerConfig,
  TimebaseState,
  Waveform,
} from "../../facades/oscilloscope.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import { type GdsProfile, GDS_DEFAULT } from "./gds-profile.js";

const COUPLING_IN: Record<string, OscilloscopeCoupling> = {
  DC: "dc",
  AC: "ac",
  GND: "gnd",
  GR: "gnd",
};

const COUPLING_OUT: Record<OscilloscopeCoupling, string> = {
  dc: "DC",
  ac: "AC",
  gnd: "GND",
};

/**
 * GW Instek GDS / MSO / MDO / MPO oscilloscope driver.
 *
 * The GDS SCPI tree is `:CHANnel<n>:*` + `:TIMebase:*` + `:ACQuire:*`.
 * Waveform readback uses a GW-specific ASCII preamble returned by
 * `:CHANnel<n>:MEMory?` (16-line header followed by comma-separated
 * signed integers). We parse the header's `Sampling Period` and
 * `Vertical Scale` fields to reconstruct x/y axes.
 *
 * Trigger surface is narrow: edge only. Pulse / slope / video are
 * reachable on GDS-2000E and up but the field ordering is undocumented
 * for several revisions; punt until a community report lands.
 */
export class GwInstekGds implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: GdsProfile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;
  readonly decoders?: OscilloscopeDecoderCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: GdsProfile = GDS_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);
    const sources = this.#channelIds.map((c) => `CH${c}`);
    this.trigger = {
      types: ["edge"],
      sources: [...sources, "EXT", "LINE"],
      couplings: ["dc", "ac"],
      sweepModes: ["auto", "normal", "single"],
      holdoffRangeSec: { min: 100e-9, max: 10 },
      supportsForce: true,
    };
    this.acquisition = {
      modes: ["normal", "peakDetect", "average", "highResolution"],
      averagesRange: { min: 2, max: 256 },
      memoryDepths: [profile.memoryDepth],
      supportsAutoset: true,
    };
    if (profile.decoders.length > 0) {
      this.decoders = {
        buses: 2,
        protocols: profile.decoders,
        sources,
      };
    }
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
    await this.port.write(`:CHANnel${channel}:COUPling ${COUPLING_OUT[coupling]}`);
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scaleRaw, posRaw] = await Promise.all([
      safeQuery(this.port, ":TIMebase:SCALe?"),
      safeQuery(this.port, ":TIMebase:POSition?"),
    ]);
    return {
      scale: parseNumberOrZero(scaleRaw) || 1e-3,
      position: parseNumberOrZero(posRaw),
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
    await this.port.write(":SINGle");
  }

  async forceTrigger(): Promise<void> {
    await this.port.write(":TRIGger:FORCe");
  }

  async getSweep(): Promise<OscilloscopeSweep> {
    const raw = await safeQuery(this.port, ":TRIGger:MODe?");
    const v = raw.trim().toUpperCase();
    if (v.startsWith("NORM")) return "normal";
    if (v.startsWith("SING")) return "single";
    return "auto";
  }

  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    const token = mode === "normal" ? "NORMal" : mode === "single" ? "SINGle" : "AUTO";
    await this.port.write(`:TRIGger:MODe ${token}`);
  }

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const [srcRaw, slopeRaw, levelRaw] = await Promise.all([
      safeQuery(this.port, ":TRIGger:SOURce?"),
      safeQuery(this.port, ":TRIGger:EDGE:SLOPe?"),
      safeQuery(this.port, ":TRIGger:LEVel?"),
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
    await this.port.write(`:TRIGger:SOURce ${config.source}`);
    const slope =
      config.slope === "rising" ? "POSitive" : config.slope === "falling" ? "NEGative" : "EITher";
    await this.port.write(`:TRIGger:EDGE:SLOPe ${slope}`);
    await this.port.write(`:TRIGger:LEVel ${config.level}`);
  }

  async readWaveform(channel: number): Promise<Waveform> {
    try {
      const raw = await safeQuery(this.port, `:CHANnel${channel}:MEMory?`, 10_000);
      return decodeGdsMemory(raw, channel);
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
      safeQuery(this.port, `:CHANnel${id}:DISPlay?`),
      safeQuery(this.port, `:CHANnel${id}:SCALe?`),
      safeQuery(this.port, `:CHANnel${id}:OFFSet?`),
      safeQuery(this.port, `:CHANnel${id}:COUPling?`),
      safeQuery(this.port, `:CHANnel${id}:PROBe:RATio?`),
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

/**
 * GW Instek GDS waveform memory format:
 *   `Waveform Data` preamble lines followed by `Raw Waveform Data:`
 *   marker and comma-separated signed integers (16-bit).
 *
 * Example (abbreviated):
 *   ```
 *   Format,1.00
 *   Memory Length,10000
 *   Trigger Address,5000
 *   Sampling Period,1.000000e-09
 *   Vertical Scale,2.000e-01
 *   Vertical Position,0.000e+00
 *   Horizontal Scale,1.000e-06
 *   Probe,1
 *   Raw Waveform Data:
 *   0,123,-45,...
 *   ```
 *
 * Different firmware sprinkles blank lines and varying field order; we
 * only require `Sampling Period`, `Vertical Scale`, and the
 * `Raw Waveform Data:` marker — everything else is optional.
 */
export function decodeGdsMemory(raw: string, channel: number): Waveform {
  const text = raw.replace(/\r/g, "");
  const markerIdx = text.search(/Raw Waveform Data:/i);
  const header = markerIdx === -1 ? text : text.slice(0, markerIdx);
  const body = markerIdx === -1 ? "" : text.slice(markerIdx).replace(/^[^\n]*\n/, "");
  const fields = new Map<string, string>();
  for (const line of header.split("\n")) {
    const ix = line.indexOf(",");
    if (ix === -1) continue;
    fields.set(line.slice(0, ix).trim().toLowerCase(), line.slice(ix + 1).trim());
  }
  const xIncrement =
    Number.parseFloat(fields.get("sampling period") ?? "") || 1e-6;
  const verticalScale = Number.parseFloat(fields.get("vertical scale") ?? "") || 1;
  const verticalPosition =
    Number.parseFloat(fields.get("vertical position") ?? "") || 0;
  const samples: number[] = [];
  if (body) {
    for (const tok of body.split(/[\s,]+/)) {
      if (!tok) continue;
      const n = Number.parseFloat(tok);
      if (Number.isFinite(n)) samples.push(n);
    }
  }
  const length = samples.length;
  const x = new Float64Array(length);
  const y = new Float64Array(length);
  // GDS 16-bit samples are normalised to ±25 divisions × 8000 counts.
  // Convert via vertical scale and position.
  const SCALE = verticalScale / 25;
  for (let i = 0; i < length; i += 1) {
    const s = samples[i] ?? 0;
    y[i] = s * SCALE - verticalPosition;
    x[i] = i * xIncrement;
  }
  return {
    channel,
    x,
    y,
    xIncrement,
    xOrigin: 0,
    capturedAt: Date.now(),
  };
}
