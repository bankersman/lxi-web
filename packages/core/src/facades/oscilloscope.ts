import type { InstrumentFacade } from "./base.js";
import type { InstrumentPresetCapability } from "./multimeter.js";

export type OscilloscopeCoupling = "dc" | "ac" | "gnd";

export type OscilloscopeChannelBandwidthLimit =
  | "off"
  | "20M"
  | "100M"
  | "200M";

export type OscilloscopeChannelUnit = "V" | "A";

export interface OscilloscopeChannelState {
  readonly id: number;
  readonly label: string;
  readonly enabled: boolean;
  readonly scale: number;
  readonly offset: number;
  readonly coupling: OscilloscopeCoupling;
  readonly probeAttenuation: number;
  readonly bandwidthLimit?: OscilloscopeChannelBandwidthLimit;
  readonly invert?: boolean;
  readonly unit?: OscilloscopeChannelUnit;
}

export interface TimebaseState {
  readonly scale: number;
  readonly position: number;
}

export interface Waveform {
  readonly channel: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly xIncrement: number;
  readonly xOrigin: number;
  readonly capturedAt: number;
}

// ---- 2.7a trigger matrix + acquisition ----

export type OscilloscopeSweep = "auto" | "normal" | "single";

export type OscilloscopeTriggerEdgeSlope = "rising" | "falling" | "either";
export type OscilloscopeTriggerCoupling = "dc" | "ac" | "hfReject" | "lfReject" | "nReject";
export type OscilloscopeTriggerPolarity = "positive" | "negative";
export type OscilloscopeTriggerCondition =
  | "greaterThan"
  | "lessThan"
  | "between"
  | "outside";

export interface OscilloscopeEdgeTriggerConfig {
  readonly type: "edge";
  readonly source: string;
  readonly slope: OscilloscopeTriggerEdgeSlope;
  readonly level: number;
}

export interface OscilloscopePulseTriggerConfig {
  readonly type: "pulse";
  readonly source: string;
  readonly polarity: OscilloscopeTriggerPolarity;
  readonly condition: OscilloscopeTriggerCondition;
  readonly level: number;
  readonly widthLower?: number;
  readonly widthUpper?: number;
}

export interface OscilloscopeSlopeTriggerConfig {
  readonly type: "slope";
  readonly source: string;
  readonly slope: OscilloscopeTriggerEdgeSlope;
  readonly condition: OscilloscopeTriggerCondition;
  readonly upperLevel: number;
  readonly lowerLevel: number;
  readonly timeLower?: number;
  readonly timeUpper?: number;
}

export interface OscilloscopeVideoTriggerConfig {
  readonly type: "video";
  readonly source: string;
  readonly standard: "ntsc" | "pal" | "sdtv" | "hdtv" | "custom";
  readonly sync: "allLines" | "lineNumber" | "oddField" | "evenField" | "allFields";
  readonly lineNumber?: number;
}

export interface OscilloscopeRuntTriggerConfig {
  readonly type: "runt";
  readonly source: string;
  readonly polarity: OscilloscopeTriggerPolarity;
  readonly condition: OscilloscopeTriggerCondition;
  readonly upperLevel: number;
  readonly lowerLevel: number;
}

export interface OscilloscopeWindowTriggerConfig {
  readonly type: "window";
  readonly source: string;
  readonly upperLevel: number;
  readonly lowerLevel: number;
  readonly position: "enter" | "exit" | "time";
  readonly holdTime?: number;
}

export interface OscilloscopeTimeoutTriggerConfig {
  readonly type: "timeout";
  readonly source: string;
  readonly slope: OscilloscopeTriggerEdgeSlope;
  readonly timeout: number;
  readonly level: number;
}

export interface OscilloscopeNthEdgeTriggerConfig {
  readonly type: "nthEdge";
  readonly source: string;
  readonly slope: OscilloscopeTriggerEdgeSlope;
  readonly idle: number;
  readonly edgeCount: number;
  readonly level: number;
}

export type OscilloscopeTriggerConfig =
  | OscilloscopeEdgeTriggerConfig
  | OscilloscopePulseTriggerConfig
  | OscilloscopeSlopeTriggerConfig
  | OscilloscopeVideoTriggerConfig
  | OscilloscopeRuntTriggerConfig
  | OscilloscopeWindowTriggerConfig
  | OscilloscopeTimeoutTriggerConfig
  | OscilloscopeNthEdgeTriggerConfig;

export interface OscilloscopeTriggerCapability {
  readonly types: readonly OscilloscopeTriggerConfig["type"][];
  readonly sources: readonly string[];
  readonly couplings: readonly OscilloscopeTriggerCoupling[];
  readonly sweepModes: readonly OscilloscopeSweep[];
  readonly holdoffRangeSec: { readonly min: number; readonly max: number };
  readonly supportsForce: boolean;
}

export type OscilloscopeAcquisitionMode =
  | "normal"
  | "average"
  | "peakDetect"
  | "highResolution";

export type OscilloscopeMemoryDepth =
  | "auto"
  | "1k"
  | "10k"
  | "100k"
  | "1M"
  | "10M"
  | "25M";

export interface OscilloscopeAcquisitionConfig {
  readonly mode: OscilloscopeAcquisitionMode;
  readonly averages: number;
  readonly memoryDepth: OscilloscopeMemoryDepth;
}

export interface OscilloscopeAcquisitionCapability {
  readonly modes: readonly OscilloscopeAcquisitionMode[];
  readonly averagesRange: { readonly min: number; readonly max: number };
  readonly memoryDepths: readonly OscilloscopeMemoryDepth[];
  readonly supportsAutoset: boolean;
}

// ---- 2.7b measurements / cursors / math ----

export interface OscilloscopeMeasurementItem {
  readonly id: string; // e.g. "vpp", "vmax", "period"
  readonly label: string;
  readonly unit: string;
  readonly category: "time" | "voltage" | "other";
}

export interface OscilloscopeMeasurementResult {
  readonly id: string;
  readonly source: string;
  readonly value: number;
  readonly unit: string;
  readonly stats?: {
    readonly min: number;
    readonly max: number;
    readonly average: number;
    readonly stddev: number;
    readonly count: number;
  };
}

export interface OscilloscopeMeasurementCapability {
  readonly items: readonly OscilloscopeMeasurementItem[];
  readonly sources: readonly string[];
  readonly maxSelections: number;
  readonly supportsStatistics: boolean;
}

export type OscilloscopeCursorMode = "off" | "manual" | "track" | "auto";

export interface OscilloscopeCursorConfig {
  readonly mode: OscilloscopeCursorMode;
  readonly axis: "x" | "y" | "xy";
  readonly source?: string;
  readonly aX?: number;
  readonly bX?: number;
  readonly aY?: number;
  readonly bY?: number;
}

export interface OscilloscopeCursorReadout {
  readonly aX?: number;
  readonly bX?: number;
  readonly aY?: number;
  readonly bY?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly inverseDeltaX?: number;
}

export interface OscilloscopeCursorCapability {
  readonly modes: readonly OscilloscopeCursorMode[];
}

export type OscilloscopeMathOperator =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "fft"
  | "int"
  | "diff"
  | "sqrt"
  | "log"
  | "ln"
  | "exp"
  | "abs";

export type OscilloscopeFftWindow =
  | "rectangle"
  | "hanning"
  | "hamming"
  | "blackmanHarris"
  | "flatTop"
  | "triangle";

export interface OscilloscopeMathConfig {
  readonly enabled: boolean;
  readonly operator: OscilloscopeMathOperator;
  readonly source1: string;
  readonly source2?: string;
  readonly scale?: number;
  readonly offset?: number;
  readonly fft?: {
    readonly window: OscilloscopeFftWindow;
    readonly span: number;
    readonly center: number;
  };
}

export interface OscilloscopeMathCapability {
  readonly operators: readonly OscilloscopeMathOperator[];
  readonly fftWindows: readonly OscilloscopeFftWindow[];
  readonly sources: readonly string[];
}

// ---- 2.7c references + history + display ----

export interface OscilloscopeReferenceSlotState {
  readonly slot: number;
  readonly enabled: boolean;
  readonly source?: string;
  readonly label?: string;
}

export interface OscilloscopeReferenceCapability {
  readonly slots: number;
}

export interface OscilloscopeHistoryCapability {
  readonly maxFrames: number;
  readonly supportsPlayback: boolean;
}

export interface OscilloscopeHistoryState {
  readonly enabled: boolean;
  readonly totalFrames: number;
  readonly currentFrame: number;
  readonly playing?: boolean;
}

export type OscilloscopeDisplayPersistence =
  | "min"
  | "0.1s"
  | "0.2s"
  | "0.5s"
  | "1s"
  | "5s"
  | "10s"
  | "infinite";

export type OscilloscopeScreenshotFormat = "png" | "bmp" | "jpg";

export interface OscilloscopeDisplayCapability {
  readonly screenshotFormats: readonly OscilloscopeScreenshotFormat[];
  readonly persistenceOptions: readonly OscilloscopeDisplayPersistence[];
}

export interface OscilloscopeScreenshot {
  readonly format: OscilloscopeScreenshotFormat;
  readonly data: Uint8Array;
  readonly capturedAt: number;
}

// ---- 2.7d protocol decoders ----

export type OscilloscopeDecoderProtocol =
  | "i2c"
  | "spi"
  | "uart"
  | "can"
  | "lin";

export interface OscilloscopeI2cDecoderConfig {
  readonly protocol: "i2c";
  readonly sclSource: string;
  readonly sdaSource: string;
  readonly addressMode: "7bit" | "10bit";
}

export interface OscilloscopeSpiDecoderConfig {
  readonly protocol: "spi";
  readonly clkSource: string;
  readonly mosiSource: string;
  readonly misoSource?: string;
  readonly csSource?: string;
  readonly bitOrder: "msb" | "lsb";
  readonly polarity: "positive" | "negative";
  readonly phase: "firstEdge" | "secondEdge";
  readonly width: number;
}

export interface OscilloscopeUartDecoderConfig {
  readonly protocol: "uart";
  readonly txSource: string;
  readonly rxSource?: string;
  readonly baud: number;
  readonly dataBits: 5 | 6 | 7 | 8 | 9;
  readonly parity: "none" | "odd" | "even";
  readonly stopBits: 1 | 1.5 | 2;
  readonly polarity: "positive" | "negative";
}

export interface OscilloscopeCanDecoderConfig {
  readonly protocol: "can";
  readonly source: string;
  readonly signalType: "tx" | "rx" | "canH" | "canL" | "differential";
  readonly baud: number;
  readonly samplePoint: number;
}

export interface OscilloscopeLinDecoderConfig {
  readonly protocol: "lin";
  readonly source: string;
  readonly baud: number;
  readonly version: "1.x" | "2.x" | "both";
}

export type OscilloscopeDecoderConfig =
  | OscilloscopeI2cDecoderConfig
  | OscilloscopeSpiDecoderConfig
  | OscilloscopeUartDecoderConfig
  | OscilloscopeCanDecoderConfig
  | OscilloscopeLinDecoderConfig;

export interface OscilloscopeDecoderState {
  readonly id: number;
  readonly enabled: boolean;
  readonly config: OscilloscopeDecoderConfig | null;
}

export interface OscilloscopeDecoderCapability {
  readonly buses: number;
  readonly protocols: readonly OscilloscopeDecoderProtocol[];
  readonly sources: readonly string[];
}

export interface OscilloscopeDecoderPacket {
  readonly seq: number;
  readonly busId: number;
  readonly protocol: OscilloscopeDecoderProtocol;
  readonly timestamp: number;
  /** Protocol-shaped payload. Kept as arbitrary map for NDJSON streaming. */
  readonly fields: Readonly<Record<string, string | number | boolean | null>>;
}

// ---- Interface ----

export interface IOscilloscope extends InstrumentFacade {
  readonly kind: "oscilloscope";

  // 2.7a
  readonly trigger?: OscilloscopeTriggerCapability;
  readonly acquisition?: OscilloscopeAcquisitionCapability;

  // 2.7b
  readonly measurements?: OscilloscopeMeasurementCapability;
  readonly cursors?: OscilloscopeCursorCapability;
  readonly math?: OscilloscopeMathCapability;

  // 2.7c
  readonly references?: OscilloscopeReferenceCapability;
  readonly history?: OscilloscopeHistoryCapability;
  readonly display?: OscilloscopeDisplayCapability;
  readonly presets?: InstrumentPresetCapability;

  // 2.7d
  readonly decoders?: OscilloscopeDecoderCapability;

  // Core capture / state
  getChannels(): Promise<OscilloscopeChannelState[]>;
  setChannelEnabled(channel: number, enabled: boolean): Promise<void>;
  getTimebase(): Promise<TimebaseState>;
  setTimebase(settings: Partial<TimebaseState>): Promise<void>;
  singleCapture(): Promise<void>;
  readWaveform(channel: number): Promise<Waveform>;

  // 2.7a optional methods
  setChannelBandwidthLimit?(channel: number, limit: OscilloscopeChannelBandwidthLimit): Promise<void>;
  setChannelInvert?(channel: number, invert: boolean): Promise<void>;
  setChannelUnit?(channel: number, unit: OscilloscopeChannelUnit): Promise<void>;
  setChannelCoupling?(channel: number, coupling: OscilloscopeCoupling): Promise<void>;
  setChannelScale?(channel: number, volts: number): Promise<void>;
  setChannelOffset?(channel: number, volts: number): Promise<void>;
  getSweep?(): Promise<OscilloscopeSweep>;
  setSweep?(mode: OscilloscopeSweep): Promise<void>;
  forceTrigger?(): Promise<void>;
  getTriggerConfig?(): Promise<OscilloscopeTriggerConfig>;
  setTriggerConfig?(config: OscilloscopeTriggerConfig): Promise<void>;
  getAcquisitionConfig?(): Promise<OscilloscopeAcquisitionConfig>;
  setAcquisitionConfig?(config: OscilloscopeAcquisitionConfig): Promise<void>;
  autoset?(): Promise<void>;
  run?(): Promise<void>;
  stop?(): Promise<void>;

  // 2.7b
  getMeasurements?(): Promise<readonly OscilloscopeMeasurementResult[]>;
  setMeasurements?(
    selections: ReadonlyArray<{ readonly id: string; readonly source: string }>,
  ): Promise<void>;
  clearMeasurementStatistics?(): Promise<void>;
  getCursors?(): Promise<{ readonly config: OscilloscopeCursorConfig; readonly readout: OscilloscopeCursorReadout }>;
  setCursors?(config: OscilloscopeCursorConfig): Promise<void>;
  getMathConfig?(): Promise<OscilloscopeMathConfig>;
  setMathConfig?(config: OscilloscopeMathConfig): Promise<void>;
  readMathWaveform?(): Promise<Waveform>;

  // 2.7c
  getReferenceSlots?(): Promise<readonly OscilloscopeReferenceSlotState[]>;
  saveReference?(slot: number, source: string): Promise<void>;
  setReferenceEnabled?(slot: number, enabled: boolean): Promise<void>;
  readReferenceWaveform?(slot: number): Promise<Waveform>;
  getHistoryState?(): Promise<OscilloscopeHistoryState>;
  setHistoryEnabled?(enabled: boolean): Promise<void>;
  setHistoryFrame?(frame: number): Promise<void>;
  setHistoryPlayback?(playing: boolean): Promise<void>;
  captureScreenshot?(format: OscilloscopeScreenshotFormat): Promise<OscilloscopeScreenshot>;
  getDisplayPersistence?(): Promise<OscilloscopeDisplayPersistence>;
  setDisplayPersistence?(p: OscilloscopeDisplayPersistence): Promise<void>;
  getPresetCatalog?(): Promise<readonly boolean[]>;
  savePreset?(slot: number): Promise<void>;
  recallPreset?(slot: number): Promise<void>;

  // 2.7d
  getDecoders?(): Promise<readonly OscilloscopeDecoderState[]>;
  setDecoder?(busId: number, config: OscilloscopeDecoderConfig | null): Promise<void>;
  fetchDecoderPackets?(
    busId: number,
    since?: number,
  ): Promise<readonly OscilloscopeDecoderPacket[]>;
}
