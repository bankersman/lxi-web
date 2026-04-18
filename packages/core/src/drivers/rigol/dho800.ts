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
  OscilloscopeCursorCapability,
  OscilloscopeCursorConfig,
  OscilloscopeCursorMode,
  OscilloscopeCursorReadout,
  OscilloscopeDecoderCapability,
  OscilloscopeDecoderConfig,
  OscilloscopeDecoderPacket,
  OscilloscopeDecoderProtocol,
  OscilloscopeDecoderState,
  OscilloscopeDisplayCapability,
  OscilloscopeDisplayPersistence,
  OscilloscopeHistoryCapability,
  OscilloscopeHistoryState,
  OscilloscopeMathCapability,
  OscilloscopeMathConfig,
  OscilloscopeMathOperator,
  OscilloscopeMeasurementCapability,
  OscilloscopeMeasurementResult,
  OscilloscopeMemoryDepth,
  OscilloscopeReferenceCapability,
  OscilloscopeReferenceSlotState,
  OscilloscopeScreenshot,
  OscilloscopeScreenshotFormat,
  OscilloscopeSweep,
  OscilloscopeTriggerCapability,
  OscilloscopeTriggerConfig,
  TimebaseState,
  Waveform,
} from "../../facades/oscilloscope.js";
import { type Dho800Profile, DHO800_DEFAULT } from "./dho800-profile.js";
import { parseBool } from "./_shared/index.js";

const ONE_OF_COUPLINGS: Record<string, OscilloscopeCoupling> = {
  DC: "dc",
  AC: "ac",
  GND: "gnd",
};
const REV_COUPLINGS: Record<OscilloscopeCoupling, string> = {
  dc: "DC",
  ac: "AC",
  gnd: "GND",
};

// ---- Shared SCPI shape (identical across every DHO800 variant) ----

const TRIGGER_TYPES: OscilloscopeTriggerCapability["types"] = [
  "edge",
  "pulse",
  "slope",
  "video",
  "runt",
  "window",
  "timeout",
  "nthEdge",
];

const TRIGGER_COUPLINGS: OscilloscopeTriggerCapability["couplings"] = [
  "dc",
  "ac",
  "hfReject",
  "lfReject",
  "nReject",
];

const TRIGGER_SWEEP_MODES: OscilloscopeTriggerCapability["sweepModes"] = [
  "auto",
  "normal",
  "single",
];

const ACQ_MODES: OscilloscopeAcquisitionCapability["modes"] = [
  "normal",
  "average",
  "peakDetect",
  "highResolution",
];

const MEASUREMENT_ITEMS: OscilloscopeMeasurementCapability["items"] = [
  { id: "vmax", label: "Vmax", unit: "V", category: "voltage" },
  { id: "vmin", label: "Vmin", unit: "V", category: "voltage" },
  { id: "vpp", label: "Vpp", unit: "V", category: "voltage" },
  { id: "vtop", label: "Vtop", unit: "V", category: "voltage" },
  { id: "vbase", label: "Vbase", unit: "V", category: "voltage" },
  { id: "vamp", label: "Vamp", unit: "V", category: "voltage" },
  { id: "vavg", label: "Vavg", unit: "V", category: "voltage" },
  { id: "vrms", label: "Vrms", unit: "V", category: "voltage" },
  { id: "overshoot", label: "Overshoot", unit: "%", category: "voltage" },
  { id: "preshoot", label: "Preshoot", unit: "%", category: "voltage" },
  { id: "area", label: "Area", unit: "V·s", category: "voltage" },
  { id: "periodArea", label: "Period Area", unit: "V·s", category: "voltage" },
  { id: "period", label: "Period", unit: "s", category: "time" },
  { id: "frequency", label: "Frequency", unit: "Hz", category: "time" },
  { id: "riseTime", label: "Rise Time", unit: "s", category: "time" },
  { id: "fallTime", label: "Fall Time", unit: "s", category: "time" },
  { id: "pulseWidthPos", label: "+Width", unit: "s", category: "time" },
  { id: "pulseWidthNeg", label: "-Width", unit: "s", category: "time" },
  { id: "dutyPos", label: "+Duty", unit: "%", category: "time" },
  { id: "dutyNeg", label: "-Duty", unit: "%", category: "time" },
  { id: "delayAB", label: "Delay A→B", unit: "s", category: "time" },
  { id: "phaseAB", label: "Phase A→B", unit: "°", category: "time" },
];

const CURSOR_CAP: OscilloscopeCursorCapability = {
  modes: ["off", "manual", "track", "auto"],
};

const MATH_OPERATORS: OscilloscopeMathCapability["operators"] = [
  "add",
  "sub",
  "mul",
  "div",
  "fft",
  "int",
  "diff",
  "sqrt",
  "log",
  "ln",
  "exp",
  "abs",
];

const FFT_WINDOWS: OscilloscopeMathCapability["fftWindows"] = [
  "rectangle",
  "hanning",
  "hamming",
  "blackmanHarris",
  "flatTop",
  "triangle",
];

const HISTORY_CAP: OscilloscopeHistoryCapability = {
  maxFrames: 1000,
  supportsPlayback: true,
};
const DISPLAY_CAP: OscilloscopeDisplayCapability = {
  screenshotFormats: ["png", "bmp", "jpg"],
  persistenceOptions: ["min", "0.1s", "0.2s", "0.5s", "1s", "5s", "10s", "infinite"],
};

/**
 * Channel source tokens derived from profile. Rigol always numbers from
 * CH1 upwards, so a 2-channel variant advertises ["CH1", "CH2"].
 */
function channelSources(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `CH${i + 1}`);
}

// ---- driver ----

export class RigolDho800 implements IOscilloscope {
  readonly kind = "oscilloscope" as const;
  readonly profile: Dho800Profile;
  readonly trigger: OscilloscopeTriggerCapability;
  readonly acquisition: OscilloscopeAcquisitionCapability;
  readonly measurements: OscilloscopeMeasurementCapability;
  readonly cursors = CURSOR_CAP;
  readonly math: OscilloscopeMathCapability;
  readonly references: OscilloscopeReferenceCapability;
  readonly history = HISTORY_CAP;
  readonly display = DISPLAY_CAP;
  readonly presets: InstrumentPresetCapability;
  readonly decoders: OscilloscopeDecoderCapability;

  readonly #channelIds: readonly number[];

  // Selected measurements survive in-memory; Rigol lets you enable/disable
  // but we also cache the selection so get/set is idempotent per session.
  #selectedMeasurements: Array<{ id: string; source: string }> = [];
  #cursorConfig: OscilloscopeCursorConfig = { mode: "off", axis: "x" };
  #mathConfig: OscilloscopeMathConfig = {
    enabled: false,
    operator: "add",
    source1: "CH1",
    source2: "CH2",
  };
  #refSlots: OscilloscopeReferenceSlotState[];
  #history: OscilloscopeHistoryState = {
    enabled: false,
    totalFrames: 0,
    currentFrame: 0,
    playing: false,
  };
  #persistence: OscilloscopeDisplayPersistence = "min";
  #presetOccupied: boolean[];
  #decoderStates: OscilloscopeDecoderState[];
  #decoderPackets: Map<number, OscilloscopeDecoderPacket[]> = new Map();

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Dho800Profile = DHO800_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channels }, (_, i) => i + 1);
    const channelSrc = channelSources(profile.channels);

    this.trigger = {
      types: TRIGGER_TYPES,
      sources: [...channelSrc, "EXT", "AC"],
      couplings: TRIGGER_COUPLINGS,
      sweepModes: TRIGGER_SWEEP_MODES,
      holdoffRangeSec: { min: 8e-9, max: 10 },
      supportsForce: true,
    };
    this.acquisition = {
      modes: ACQ_MODES,
      averagesRange: { min: 2, max: 65536 },
      memoryDepths: profile.memoryDepths,
      supportsAutoset: true,
    };
    this.measurements = {
      items: MEASUREMENT_ITEMS,
      sources: [...channelSrc, "MATH"],
      maxSelections: 10,
      supportsStatistics: true,
    };
    this.math = {
      operators: MATH_OPERATORS,
      fftWindows: FFT_WINDOWS,
      sources: channelSrc,
    };
    this.references = { slots: profile.referenceSlots };
    this.presets = { slots: 10 };
    this.decoders = {
      buses: profile.decoderBuses,
      protocols: profile.decoderProtocols,
      sources: channelSrc,
    };

    this.#refSlots = Array.from({ length: profile.referenceSlots }, (_, i) => ({
      slot: i,
      enabled: false,
    }));
    this.#presetOccupied = Array.from({ length: 10 }, () => false);
    this.#decoderStates = Array.from({ length: profile.decoderBuses }, (_, i) => ({
      id: i + 1,
      enabled: false,
      config: null,
    }));
  }

  // ---- core ----

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    return Promise.all(this.#channelIds.map(async (id) => this.#readChannel(id)));
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:DISPlay ${enabled ? "ON" : "OFF"}`);
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scale, position] = await Promise.all([
      this.port.query(":TIMebase:MAIN:SCALe?"),
      this.port.query(":TIMebase:MAIN:OFFSet?"),
    ]);
    return { scale: Number.parseFloat(scale), position: Number.parseFloat(position) };
  }

  async setTimebase(settings: Partial<TimebaseState>): Promise<void> {
    if (settings.scale !== undefined) {
      await this.port.write(`:TIMebase:MAIN:SCALe ${settings.scale}`);
    }
    if (settings.position !== undefined) {
      await this.port.write(`:TIMebase:MAIN:OFFSet ${settings.position}`);
    }
  }

  async singleCapture(): Promise<void> {
    await this.port.write(":SINGle");
  }

  async readWaveform(channel: number): Promise<Waveform> {
    return this.#readWaveformFromSource(`CHANnel${channel}`, channel);
  }

  async #readWaveformFromSource(source: string, channel: number): Promise<Waveform> {
    await this.port.write(`:WAVeform:SOURce ${source}`);
    await this.port.write(":WAVeform:MODE NORMal");
    await this.port.write(":WAVeform:FORMat BYTE");
    const preambleRaw = await this.port.query(":WAVeform:PREamble?");
    const preamble = parsePreamble(preambleRaw);
    const raw = await this.port.queryBinary(":WAVeform:DATA?", { timeoutMs: 15_000 });
    const y = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const byte = raw[i] ?? 0;
      y[i] = (byte - preamble.yOrigin - preamble.yReference) * preamble.yIncrement;
    }
    const x = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      x[i] = preamble.xOrigin + i * preamble.xIncrement;
    }
    return {
      channel,
      x,
      y,
      xIncrement: preamble.xIncrement,
      xOrigin: preamble.xOrigin,
      capturedAt: Date.now(),
    };
  }

  async #readChannel(id: number): Promise<OscilloscopeChannelState> {
    const [display, scale, offset, coupling, probe, bw, invert, unit] = await Promise.all([
      this.port.query(`:CHANnel${id}:DISPlay?`),
      this.port.query(`:CHANnel${id}:SCALe?`),
      this.port.query(`:CHANnel${id}:OFFSet?`),
      this.port.query(`:CHANnel${id}:COUPling?`),
      this.port.query(`:CHANnel${id}:PROBe?`),
      this.port.query(`:CHANnel${id}:BWLimit?`).catch(() => "OFF"),
      this.port.query(`:CHANnel${id}:INVert?`).catch(() => "0"),
      this.port.query(`:CHANnel${id}:UNITs?`).catch(() => "VOLT"),
    ]);
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(display),
      scale: Number.parseFloat(scale),
      offset: Number.parseFloat(offset),
      coupling: ONE_OF_COUPLINGS[coupling.trim().toUpperCase()] ?? "dc",
      probeAttenuation: Number.parseFloat(probe),
      bandwidthLimit: parseBwLimit(bw),
      invert: parseBool(invert),
      unit: parseUnit(unit),
    };
  }

  // ---- 2.7a channel extras ----

  async setChannelCoupling(channel: number, coupling: OscilloscopeCoupling): Promise<void> {
    await this.port.write(`:CHANnel${channel}:COUPling ${REV_COUPLINGS[coupling]}`);
  }
  async setChannelScale(channel: number, volts: number): Promise<void> {
    await this.port.write(`:CHANnel${channel}:SCALe ${volts}`);
  }
  async setChannelOffset(channel: number, volts: number): Promise<void> {
    await this.port.write(`:CHANnel${channel}:OFFSet ${volts}`);
  }
  async setChannelBandwidthLimit(
    channel: number,
    limit: OscilloscopeChannelBandwidthLimit,
  ): Promise<void> {
    if (!this.profile.bwLimits.includes(limit)) {
      throw new Error(
        `bandwidth limit '${limit}' not supported by ${this.profile.variant}`,
      );
    }
    const scpi = limit === "off" ? "OFF" : limit === "20M" ? "20M" : limit === "100M" ? "100M" : "200M";
    await this.port.write(`:CHANnel${channel}:BWLimit ${scpi}`);
  }
  async setChannelInvert(channel: number, invert: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:INVert ${invert ? "ON" : "OFF"}`);
  }
  async setChannelUnit(channel: number, unit: OscilloscopeChannelUnit): Promise<void> {
    await this.port.write(`:CHANnel${channel}:UNITs ${unit === "V" ? "VOLT" : "AMP"}`);
  }

  // ---- 2.7a trigger + sweep ----

  async getSweep(): Promise<OscilloscopeSweep> {
    const raw = (await this.port.query(":TRIGger:SWEep?")).trim().toUpperCase();
    if (raw.startsWith("AUT")) return "auto";
    if (raw.startsWith("NORM")) return "normal";
    return "single";
  }
  async setSweep(mode: OscilloscopeSweep): Promise<void> {
    const scpi = mode === "auto" ? "AUTO" : mode === "normal" ? "NORMal" : "SINGle";
    await this.port.write(`:TRIGger:SWEep ${scpi}`);
  }
  async forceTrigger(): Promise<void> {
    await this.port.write(":TFORce");
  }

  async getTriggerConfig(): Promise<OscilloscopeTriggerConfig> {
    const mode = (await this.port.query(":TRIGger:MODE?")).trim().toUpperCase();
    switch (true) {
      case mode.startsWith("EDGE"): {
        const [source, slope, level] = await Promise.all([
          this.port.query(":TRIGger:EDGE:SOURce?"),
          this.port.query(":TRIGger:EDGE:SLOPe?"),
          this.port.query(":TRIGger:EDGE:LEVel?"),
        ]);
        return {
          type: "edge",
          source: source.trim().toUpperCase(),
          slope: parseEdgeSlope(slope),
          level: Number.parseFloat(level),
        };
      }
      case mode.startsWith("PULS"): {
        const [source, polarity, level] = await Promise.all([
          this.port.query(":TRIGger:PULSe:SOURce?"),
          this.port.query(":TRIGger:PULSe:POLarity?"),
          this.port.query(":TRIGger:PULSe:LEVel?"),
        ]);
        return {
          type: "pulse",
          source: source.trim().toUpperCase(),
          polarity: polarity.trim().toUpperCase().startsWith("POS") ? "positive" : "negative",
          condition: "greaterThan",
          level: Number.parseFloat(level),
        };
      }
      default: {
        return { type: "edge", source: "CH1", slope: "rising", level: 0 };
      }
    }
  }
  async setTriggerConfig(config: OscilloscopeTriggerConfig): Promise<void> {
    switch (config.type) {
      case "edge":
        await this.port.write(`:TRIGger:MODE EDGE`);
        await this.port.write(`:TRIGger:EDGE:SOURce ${config.source}`);
        await this.port.write(
          `:TRIGger:EDGE:SLOPe ${encodeEdgeSlope(config.slope)}`,
        );
        await this.port.write(`:TRIGger:EDGE:LEVel ${config.level}`);
        break;
      case "pulse":
        await this.port.write(`:TRIGger:MODE PULSe`);
        await this.port.write(`:TRIGger:PULSe:SOURce ${config.source}`);
        await this.port.write(
          `:TRIGger:PULSe:POLarity ${config.polarity === "positive" ? "POSitive" : "NEGative"}`,
        );
        await this.port.write(`:TRIGger:PULSe:LEVel ${config.level}`);
        break;
      case "slope":
        await this.port.write(`:TRIGger:MODE SLOPe`);
        await this.port.write(`:TRIGger:SLOPe:SOURce ${config.source}`);
        await this.port.write(`:TRIGger:SLOPe:ALEVel ${config.upperLevel}`);
        await this.port.write(`:TRIGger:SLOPe:BLEVel ${config.lowerLevel}`);
        break;
      case "video":
        await this.port.write(`:TRIGger:MODE VIDeo`);
        await this.port.write(`:TRIGger:VIDeo:SOURce ${config.source}`);
        break;
      case "runt":
        await this.port.write(`:TRIGger:MODE RUNT`);
        await this.port.write(`:TRIGger:RUNT:SOURce ${config.source}`);
        break;
      case "window":
        await this.port.write(`:TRIGger:MODE WINDows`);
        await this.port.write(`:TRIGger:WINDows:SOURce ${config.source}`);
        break;
      case "timeout":
        await this.port.write(`:TRIGger:MODE TIMeout`);
        await this.port.write(`:TRIGger:TIMeout:SOURce ${config.source}`);
        await this.port.write(`:TRIGger:TIMeout:TIME ${config.timeout}`);
        break;
      case "nthEdge":
        await this.port.write(`:TRIGger:MODE NEDGe`);
        await this.port.write(`:TRIGger:NEDGe:SOURce ${config.source}`);
        await this.port.write(`:TRIGger:NEDGe:EDGE ${config.edgeCount}`);
        break;
    }
  }

  // ---- 2.7a acquisition ----

  async getAcquisitionConfig(): Promise<OscilloscopeAcquisitionConfig> {
    const [mode, averages, mdepth] = await Promise.all([
      this.port.query(":ACQuire:TYPE?"),
      this.port.query(":ACQuire:AVERages?").catch(() => "2"),
      this.port.query(":ACQuire:MDEPth?").catch(() => "AUTO"),
    ]);
    return {
      mode: parseAcqMode(mode),
      averages: Number.parseFloat(averages),
      memoryDepth: parseMemoryDepth(mdepth),
    };
  }
  async setAcquisitionConfig(config: OscilloscopeAcquisitionConfig): Promise<void> {
    await this.port.write(`:ACQuire:TYPE ${encodeAcqMode(config.mode)}`);
    if (config.mode === "average") {
      await this.port.write(`:ACQuire:AVERages ${config.averages}`);
    }
    await this.port.write(`:ACQuire:MDEPth ${encodeMemoryDepth(config.memoryDepth)}`);
  }
  async autoset(): Promise<void> {
    await this.port.write(":AUToset");
  }
  async run(): Promise<void> {
    await this.port.write(":RUN");
  }
  async stop(): Promise<void> {
    await this.port.write(":STOP");
  }

  // ---- 2.7b measurements ----

  async getMeasurements(): Promise<readonly OscilloscopeMeasurementResult[]> {
    if (this.#selectedMeasurements.length === 0) return [];
    const results: OscilloscopeMeasurementResult[] = [];
    for (const sel of this.#selectedMeasurements) {
      const scpi = MEASUREMENT_SCPI[sel.id];
      if (!scpi) continue;
      const item = MEASUREMENT_ITEMS.find((m) => m.id === sel.id);
      const src = sel.source === "MATH" ? "MATH" : sel.source;
      const raw = await this.port
        .query(`:MEASure:ITEM? ${scpi},${src}`)
        .catch(() => "nan");
      const value = Number.parseFloat(raw);
      results.push({
        id: sel.id,
        source: sel.source,
        value: Number.isFinite(value) ? value : Number.NaN,
        unit: item?.unit ?? "",
      });
    }
    return results;
  }
  async setMeasurements(
    selections: ReadonlyArray<{ readonly id: string; readonly source: string }>,
  ): Promise<void> {
    await this.port.write(":MEASure:CLEar ALL").catch(() => undefined);
    for (const sel of selections) {
      const scpi = MEASUREMENT_SCPI[sel.id];
      if (!scpi) continue;
      await this.port.write(`:MEASure:ITEM ${scpi},${sel.source}`).catch(() => undefined);
    }
    this.#selectedMeasurements = [...selections];
  }
  async clearMeasurementStatistics(): Promise<void> {
    await this.port.write(":MEASure:STATistic:RESet").catch(() => undefined);
  }

  // ---- 2.7b cursors ----

  async getCursors(): Promise<{
    readonly config: OscilloscopeCursorConfig;
    readonly readout: OscilloscopeCursorReadout;
  }> {
    const readout: OscilloscopeCursorReadout = {};
    if (this.#cursorConfig.mode === "manual") {
      const [ax, bx, ay, by] = await Promise.all([
        this.port.query(":CURSor:MANual:AX?").catch(() => "nan"),
        this.port.query(":CURSor:MANual:BX?").catch(() => "nan"),
        this.port.query(":CURSor:MANual:AY?").catch(() => "nan"),
        this.port.query(":CURSor:MANual:BY?").catch(() => "nan"),
      ]);
      const aX = Number.parseFloat(ax);
      const bX = Number.parseFloat(bx);
      const aY = Number.parseFloat(ay);
      const bY = Number.parseFloat(by);
      if (Number.isFinite(aX)) (readout as any).aX = aX;
      if (Number.isFinite(bX)) (readout as any).bX = bX;
      if (Number.isFinite(aY)) (readout as any).aY = aY;
      if (Number.isFinite(bY)) (readout as any).bY = bY;
      if (Number.isFinite(aX) && Number.isFinite(bX)) {
        const d = bX - aX;
        (readout as any).deltaX = d;
        if (d !== 0) (readout as any).inverseDeltaX = 1 / d;
      }
      if (Number.isFinite(aY) && Number.isFinite(bY)) {
        (readout as any).deltaY = bY - aY;
      }
    }
    return { config: this.#cursorConfig, readout };
  }
  async setCursors(config: OscilloscopeCursorConfig): Promise<void> {
    const mode = encodeCursorMode(config.mode);
    await this.port.write(`:CURSor:MODE ${mode}`).catch(() => undefined);
    if (config.mode === "manual") {
      if (config.aX !== undefined) {
        await this.port.write(`:CURSor:MANual:AX ${config.aX}`).catch(() => undefined);
      }
      if (config.bX !== undefined) {
        await this.port.write(`:CURSor:MANual:BX ${config.bX}`).catch(() => undefined);
      }
      if (config.aY !== undefined) {
        await this.port.write(`:CURSor:MANual:AY ${config.aY}`).catch(() => undefined);
      }
      if (config.bY !== undefined) {
        await this.port.write(`:CURSor:MANual:BY ${config.bY}`).catch(() => undefined);
      }
    }
    this.#cursorConfig = config;
  }

  // ---- 2.7b math ----

  async getMathConfig(): Promise<OscilloscopeMathConfig> {
    return this.#mathConfig;
  }
  async setMathConfig(config: OscilloscopeMathConfig): Promise<void> {
    await this.port
      .write(`:MATH:OPERator ${encodeMathOperator(config.operator)}`)
      .catch(() => undefined);
    await this.port
      .write(`:MATH:SOURce1 ${config.source1}`)
      .catch(() => undefined);
    if (config.source2) {
      await this.port.write(`:MATH:SOURce2 ${config.source2}`).catch(() => undefined);
    }
    await this.port
      .write(`:MATH:DISPlay ${config.enabled ? "ON" : "OFF"}`)
      .catch(() => undefined);
    if (config.operator === "fft" && config.fft) {
      await this.port
        .write(`:MATH:FFT:WINDow ${encodeFftWindow(config.fft.window)}`)
        .catch(() => undefined);
      await this.port.write(`:MATH:FFT:SPAN ${config.fft.span}`).catch(() => undefined);
      await this.port
        .write(`:MATH:FFT:CENTer ${config.fft.center}`)
        .catch(() => undefined);
    }
    this.#mathConfig = config;
  }
  async readMathWaveform(): Promise<Waveform> {
    return this.#readWaveformFromSource("MATH", 0);
  }

  // ---- 2.7c references ----

  async getReferenceSlots(): Promise<readonly OscilloscopeReferenceSlotState[]> {
    return this.#refSlots.slice();
  }
  async saveReference(slot: number, source: string): Promise<void> {
    const refIdx = slot + 1;
    await this.port.write(`:REFerence:CURRent REF${refIdx}`).catch(() => undefined);
    await this.port.write(`:REFerence:SOURce ${source}`).catch(() => undefined);
    await this.port.write(`:REFerence:SAVE`).catch(() => undefined);
    this.#refSlots[slot] = { slot, enabled: true, source };
  }
  async setReferenceEnabled(slot: number, enabled: boolean): Promise<void> {
    const refIdx = slot + 1;
    await this.port
      .write(`:REFerence:REF${refIdx}:DISPlay ${enabled ? "ON" : "OFF"}`)
      .catch(() => undefined);
    const cur = this.#refSlots[slot];
    this.#refSlots[slot] = { slot, enabled, source: cur?.source };
  }
  async readReferenceWaveform(slot: number): Promise<Waveform> {
    return this.#readWaveformFromSource(`REF${slot + 1}`, 0);
  }

  // ---- 2.7c history ----

  async getHistoryState(): Promise<OscilloscopeHistoryState> {
    return this.#history;
  }
  async setHistoryEnabled(enabled: boolean): Promise<void> {
    await this.port
      .write(`:HISTory:DISPlay ${enabled ? "ON" : "OFF"}`)
      .catch(() => undefined);
    this.#history = { ...this.#history, enabled };
  }
  async setHistoryFrame(frame: number): Promise<void> {
    await this.port.write(`:HISTory:FRAMe ${frame}`).catch(() => undefined);
    this.#history = { ...this.#history, currentFrame: frame };
  }
  async setHistoryPlayback(playing: boolean): Promise<void> {
    await this.port
      .write(`:HISTory:PLAY ${playing ? "ON" : "OFF"}`)
      .catch(() => undefined);
    this.#history = { ...this.#history, playing };
  }

  // ---- 2.7c display ----

  async getDisplayPersistence(): Promise<OscilloscopeDisplayPersistence> {
    return this.#persistence;
  }
  async setDisplayPersistence(p: OscilloscopeDisplayPersistence): Promise<void> {
    await this.port
      .write(`:DISPlay:GRADing:TIME ${encodePersistence(p)}`)
      .catch(() => undefined);
    this.#persistence = p;
  }
  async captureScreenshot(format: OscilloscopeScreenshotFormat): Promise<OscilloscopeScreenshot> {
    const cmd =
      format === "png"
        ? ":DISPlay:DATA? PNG"
        : format === "bmp"
        ? ":DISPlay:DATA? BMP24"
        : ":DISPlay:DATA? JPEG";
    const data = await this.port
      .queryBinary(cmd, { timeoutMs: 30_000 })
      .catch(() => new Uint8Array(0));
    return { format, data, capturedAt: Date.now() };
  }

  // ---- 2.7c presets ----

  async getPresetCatalog(): Promise<readonly boolean[]> {
    return this.#presetOccupied.slice();
  }
  async savePreset(slot: number): Promise<void> {
    await this.port.write(`*SAV ${slot}`).catch(() => undefined);
    this.#presetOccupied[slot] = true;
  }
  async recallPreset(slot: number): Promise<void> {
    await this.port.write(`*RCL ${slot}`).catch(() => undefined);
  }

  // ---- 2.7d decoders ----

  async getDecoders(): Promise<readonly OscilloscopeDecoderState[]> {
    return this.#decoderStates.slice();
  }
  async setDecoder(busId: number, config: OscilloscopeDecoderConfig | null): Promise<void> {
    if (config === null) {
      await this.port.write(`:BUS${busId}:DISPlay OFF`).catch(() => undefined);
      this.#decoderStates[busId - 1] = { id: busId, enabled: false, config: null };
      this.#decoderPackets.delete(busId);
      return;
    }
    await this.port.write(`:BUS${busId}:MODE ${encodeProtocol(config.protocol)}`).catch(() => undefined);
    switch (config.protocol) {
      case "i2c":
        await this.port.write(`:BUS${busId}:IIC:SCLK:SOURce ${config.sclSource}`).catch(() => undefined);
        await this.port.write(`:BUS${busId}:IIC:SDA:SOURce ${config.sdaSource}`).catch(() => undefined);
        break;
      case "spi":
        await this.port.write(`:BUS${busId}:SPI:CLK:SOURce ${config.clkSource}`).catch(() => undefined);
        await this.port.write(`:BUS${busId}:SPI:MOSI:SOURce ${config.mosiSource}`).catch(() => undefined);
        if (config.misoSource) {
          await this.port.write(`:BUS${busId}:SPI:MISO:SOURce ${config.misoSource}`).catch(() => undefined);
        }
        break;
      case "uart":
        await this.port.write(`:BUS${busId}:RS232:TX:SOURce ${config.txSource}`).catch(() => undefined);
        await this.port.write(`:BUS${busId}:RS232:BAUD ${config.baud}`).catch(() => undefined);
        break;
      case "can":
        await this.port.write(`:BUS${busId}:CAN:SOURce ${config.source}`).catch(() => undefined);
        await this.port.write(`:BUS${busId}:CAN:BAUD ${config.baud}`).catch(() => undefined);
        break;
      case "lin":
        await this.port.write(`:BUS${busId}:LIN:SOURce ${config.source}`).catch(() => undefined);
        await this.port.write(`:BUS${busId}:LIN:BAUD ${config.baud}`).catch(() => undefined);
        break;
    }
    await this.port.write(`:BUS${busId}:DISPlay ON`).catch(() => undefined);
    this.#decoderStates[busId - 1] = { id: busId, enabled: true, config };
    this.#decoderPackets.set(busId, []);
  }
  async fetchDecoderPackets(
    busId: number,
    since = 0,
  ): Promise<readonly OscilloscopeDecoderPacket[]> {
    const packets = this.#decoderPackets.get(busId) ?? [];
    return packets.filter((p) => p.seq > since);
  }
}

// ---- helpers ----

export function encodeCoupling(coupling: OscilloscopeCoupling): string {
  return REV_COUPLINGS[coupling];
}

function parseBwLimit(raw: string): OscilloscopeChannelBandwidthLimit {
  const v = raw.trim().toUpperCase();
  if (v.includes("20")) return "20M";
  if (v.includes("100")) return "100M";
  if (v.includes("200")) return "200M";
  return "off";
}
function parseUnit(raw: string): OscilloscopeChannelUnit {
  return raw.trim().toUpperCase().startsWith("AMP") ? "A" : "V";
}
function parseEdgeSlope(raw: string): "rising" | "falling" | "either" {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("POS") || v.startsWith("RIS")) return "rising";
  if (v.startsWith("NEG") || v.startsWith("FAL")) return "falling";
  return "either";
}
function encodeEdgeSlope(slope: "rising" | "falling" | "either"): string {
  return slope === "rising" ? "POSitive" : slope === "falling" ? "NEGative" : "RFALl";
}
function parseAcqMode(raw: string): OscilloscopeAcquisitionMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("AVER")) return "average";
  if (v.startsWith("PEAK")) return "peakDetect";
  if (v.startsWith("HRES") || v.startsWith("HIGH")) return "highResolution";
  return "normal";
}
function encodeAcqMode(mode: OscilloscopeAcquisitionMode): string {
  switch (mode) {
    case "average":
      return "AVERages";
    case "peakDetect":
      return "PEAK";
    case "highResolution":
      return "HRESolution";
    default:
      return "NORMal";
  }
}
function parseMemoryDepth(raw: string): OscilloscopeMemoryDepth {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("AUTO")) return "auto";
  const n = Number.parseFloat(v);
  if (n >= 25_000_000) return "25M";
  if (n >= 10_000_000) return "10M";
  if (n >= 1_000_000) return "1M";
  if (n >= 100_000) return "100k";
  if (n >= 10_000) return "10k";
  if (n >= 1_000) return "1k";
  return "auto";
}
function encodeMemoryDepth(d: OscilloscopeMemoryDepth): string {
  switch (d) {
    case "auto":
      return "AUTO";
    case "1k":
      return "1000";
    case "10k":
      return "10000";
    case "100k":
      return "100000";
    case "1M":
      return "1000000";
    case "10M":
      return "10000000";
    case "25M":
      return "25000000";
  }
}
function encodeCursorMode(m: OscilloscopeCursorMode): string {
  switch (m) {
    case "manual":
      return "MANual";
    case "track":
      return "TRACk";
    case "auto":
      return "AUTO";
    default:
      return "OFF";
  }
}
function encodeMathOperator(op: OscilloscopeMathOperator): string {
  const map: Record<OscilloscopeMathOperator, string> = {
    add: "ADD",
    sub: "SUBTract",
    mul: "MULTiply",
    div: "DIVision",
    fft: "FFT",
    int: "INTegrate",
    diff: "DIFFerentiate",
    sqrt: "SQRT",
    log: "LOG",
    ln: "LN",
    exp: "EXP",
    abs: "ABSolute",
  };
  return map[op];
}
function encodeFftWindow(
  w:
    | "rectangle"
    | "hanning"
    | "hamming"
    | "blackmanHarris"
    | "flatTop"
    | "triangle",
): string {
  const map: Record<string, string> = {
    rectangle: "RECT",
    hanning: "HANN",
    hamming: "HAMM",
    blackmanHarris: "BHAR",
    flatTop: "FLAT",
    triangle: "TRI",
  };
  return map[w] ?? "RECT";
}
function encodePersistence(p: OscilloscopeDisplayPersistence): string {
  const map: Record<OscilloscopeDisplayPersistence, string> = {
    min: "MIN",
    "0.1s": "0.1",
    "0.2s": "0.2",
    "0.5s": "0.5",
    "1s": "1",
    "5s": "5",
    "10s": "10",
    infinite: "INFinite",
  };
  return map[p];
}
function encodeProtocol(p: OscilloscopeDecoderProtocol): string {
  switch (p) {
    case "i2c":
      return "IIC";
    case "spi":
      return "SPI";
    case "uart":
      return "RS232";
    case "can":
      return "CAN";
    case "lin":
      return "LIN";
  }
}

const MEASUREMENT_SCPI: Record<string, string> = {
  vmax: "VMAX",
  vmin: "VMIN",
  vpp: "VPP",
  vtop: "VTOP",
  vbase: "VBASe",
  vamp: "VAMP",
  vavg: "VAVG",
  vrms: "VRMS",
  overshoot: "OVERshoot",
  preshoot: "PREShoot",
  area: "MAREa",
  periodArea: "MPARea",
  period: "PERiod",
  frequency: "FREQuency",
  riseTime: "RTIMe",
  fallTime: "FTIMe",
  pulseWidthPos: "PWIDth",
  pulseWidthNeg: "NWIDth",
  dutyPos: "PDUTy",
  dutyNeg: "NDUTy",
  delayAB: "FDELay",
  phaseAB: "FPHase",
};

interface Preamble {
  readonly points: number;
  readonly xIncrement: number;
  readonly xOrigin: number;
  readonly xReference: number;
  readonly yIncrement: number;
  readonly yOrigin: number;
  readonly yReference: number;
}

export function parsePreamble(raw: string): Preamble {
  const fields = raw.trim().split(",").map((s) => s.trim());
  const num = (idx: number): number => {
    const v = fields[idx];
    const n = v !== undefined ? Number.parseFloat(v) : Number.NaN;
    return Number.isFinite(n) ? n : 0;
  };
  return {
    points: Math.max(0, Math.round(num(2))),
    xIncrement: num(4),
    xOrigin: num(5),
    xReference: num(6),
    yIncrement: num(7),
    yOrigin: num(8),
    yReference: num(9),
  };
}
