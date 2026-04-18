import type { InstrumentFacade } from "./base.js";
import type { InstrumentPresetCapability } from "./multimeter.js";

/**
 * Discriminated frequency input: the UI and driver both accept either a
 * center/span pair or an explicit start/stop pair. The driver translates to
 * the canonical center/span internally — spectrum analyzers universally use
 * `FREQ:CENT` + `FREQ:SPAN`, but users typically think in start/stop for
 * narrow measurements and center/span for wide surveys.
 */
export type SpectrumAnalyzerFrequencyInput =
  | { readonly kind: "centerSpan"; readonly centerHz: number; readonly spanHz: number }
  | { readonly kind: "startStop"; readonly startHz: number; readonly stopHz: number };

export interface SpectrumAnalyzerFrequencyState {
  readonly centerHz: number;
  readonly spanHz: number;
  readonly startHz: number;
  readonly stopHz: number;
}

export interface SpectrumAnalyzerReferenceLevel {
  readonly dbm: number;
}

export interface SpectrumAnalyzerBandwidthState {
  readonly rbwHz: number;
  readonly vbwHz: number;
  readonly autoRbw: boolean;
  readonly autoVbw: boolean;
}

export interface SpectrumAnalyzerBandwidthInput {
  readonly rbwHz?: number;
  readonly vbwHz?: number;
  readonly autoRbw?: boolean;
  readonly autoVbw?: boolean;
}

export interface SpectrumAnalyzerSweepState {
  readonly pointsN: number;
  readonly timeSec: number;
  readonly continuous: boolean;
}

export interface SpectrumAnalyzerSweepInput {
  readonly pointsN?: number;
  readonly timeSec?: number;
  readonly continuous?: boolean;
}

// ---- Trace ---------------------------------------------------------------

export type SpectrumAnalyzerTraceMode =
  | "clearWrite"
  | "maxHold"
  | "minHold"
  | "average"
  | "view";

export type SpectrumAnalyzerTraceDetector =
  | "peak"
  | "sample"
  | "rms"
  | "negPeak"
  | "average";

export type SpectrumAnalyzerAmplitudeUnit =
  | "dBm"
  | "dBmV"
  | "dBuV"
  | "V"
  | "W";

export interface SpectrumAnalyzerTraceConfig {
  readonly id: number;
  readonly mode: SpectrumAnalyzerTraceMode;
  readonly detector: SpectrumAnalyzerTraceDetector;
  readonly enabled: boolean;
}

export interface SpectrumAnalyzerTraceData {
  readonly id: number;
  readonly points: number;
  readonly unit: SpectrumAnalyzerAmplitudeUnit;
  readonly frequencyHz: Float64Array;
  readonly amplitude: Float64Array;
  readonly timestamp: number;
}

export interface SpectrumAnalyzerTraceCapability {
  readonly traceCount: number;
  readonly modes: readonly SpectrumAnalyzerTraceMode[];
  readonly detectors: readonly SpectrumAnalyzerTraceDetector[];
  readonly units: readonly SpectrumAnalyzerAmplitudeUnit[];
}

// ---- Input ---------------------------------------------------------------

export interface SpectrumAnalyzerInputState {
  readonly attenuationDb: number;
  readonly autoAttenuation: boolean;
  readonly preampEnabled: boolean;
  readonly inputImpedanceOhm: 50 | 75;
}

export interface SpectrumAnalyzerInputInput {
  readonly attenuationDb?: number;
  readonly autoAttenuation?: boolean;
  readonly preampEnabled?: boolean;
  readonly inputImpedanceOhm?: 50 | 75;
}

export interface SpectrumAnalyzerInputCapability {
  readonly attenuationRangeDb: { readonly min: number; readonly max: number };
  readonly preamp: {
    readonly available: boolean;
    readonly freqRangeHz?: { readonly min: number; readonly max: number };
  };
  readonly inputImpedances: readonly (50 | 75)[];
}

// ---- Markers -------------------------------------------------------------

export type SpectrumAnalyzerMarkerType = "normal" | "delta" | "peak" | "band";

export interface SpectrumAnalyzerMarkerConfig {
  readonly enabled: boolean;
  readonly type: SpectrumAnalyzerMarkerType;
  readonly frequencyHz?: number;
  readonly traceId?: number;
  /** Reference marker id for `delta` markers. */
  readonly reference?: number;
  /** Integration span (Hz) for `band` markers. */
  readonly bandSpanHz?: number;
}

export interface SpectrumAnalyzerMarkerReading {
  readonly id: number;
  readonly enabled: boolean;
  readonly type: SpectrumAnalyzerMarkerType;
  readonly frequencyHz: number;
  readonly amplitude: number;
  readonly unit: SpectrumAnalyzerAmplitudeUnit;
  readonly deltaFrequencyHz?: number;
  readonly deltaAmplitude?: number;
  readonly reference?: number;
}

export interface SpectrumAnalyzerMarkerCapability {
  readonly count: number;
  readonly types: readonly SpectrumAnalyzerMarkerType[];
}

// ---- Channel power -------------------------------------------------------

export type SpectrumAnalyzerChannelPowerMode = "channelPower" | "acpr";

export interface SpectrumAnalyzerChannelPowerConfig {
  readonly enabled: boolean;
  readonly mode: SpectrumAnalyzerChannelPowerMode;
  readonly integrationBandwidthHz: number;
  readonly channelSpacingHz: number;
  readonly adjacentChannelCount: number;
}

export interface SpectrumAnalyzerChannelPowerReading {
  readonly mode: SpectrumAnalyzerChannelPowerMode;
  readonly channelPowerDbm: number;
  readonly adjacentChannelsDbc?: readonly number[];
}

export interface SpectrumAnalyzerChannelPowerCapability {
  readonly modes: readonly SpectrumAnalyzerChannelPowerMode[];
  readonly maxAdjacentChannels: number;
}

// ---- Trigger -------------------------------------------------------------

export type SpectrumAnalyzerTriggerSource =
  | "freeRun"
  | "video"
  | "external"
  | "if"
  | "fmt";

export type SpectrumAnalyzerTriggerSlope = "rising" | "falling";

export interface SpectrumAnalyzerTriggerConfig {
  readonly source: SpectrumAnalyzerTriggerSource;
  readonly levelDbm?: number;
  readonly slope?: SpectrumAnalyzerTriggerSlope;
}

export interface SpectrumAnalyzerTriggerCapability {
  readonly sources: readonly SpectrumAnalyzerTriggerSource[];
  readonly levelRangeDbm: { readonly min: number; readonly max: number };
}

// ---- Limit lines ---------------------------------------------------------

export interface SpectrumAnalyzerLimitLinePoint {
  readonly frequencyHz: number;
  readonly amplitudeDbm: number;
}

export interface SpectrumAnalyzerLimitLine {
  readonly id: number;
  readonly enabled: boolean;
  readonly label: string;
  readonly kind: "upper" | "lower";
  readonly points: readonly SpectrumAnalyzerLimitLinePoint[];
}

export interface SpectrumAnalyzerLimitResult {
  readonly id: number;
  readonly passed: boolean;
  readonly failedPoints: number;
}

export interface SpectrumAnalyzerLimitCapability {
  readonly count: number;
  readonly maxPointsPerLine: number;
}

// ---- Averaging -----------------------------------------------------------

export type SpectrumAnalyzerAveragingMode = "logPower" | "power" | "voltage";

export interface SpectrumAnalyzerAveragingConfig {
  readonly enabled: boolean;
  readonly count: number;
  readonly mode: SpectrumAnalyzerAveragingMode;
}

export interface SpectrumAnalyzerAveragingCapability {
  readonly modes: readonly SpectrumAnalyzerAveragingMode[];
  readonly countRange: { readonly min: number; readonly max: number };
}

// ---- Facade --------------------------------------------------------------

export interface ISpectrumAnalyzer extends InstrumentFacade {
  readonly kind: "spectrumAnalyzer";

  readonly traces: SpectrumAnalyzerTraceCapability;
  readonly input: SpectrumAnalyzerInputCapability;
  readonly markers: SpectrumAnalyzerMarkerCapability;
  readonly frequencyRangeHz: { readonly min: number; readonly max: number };
  readonly referenceLevelRangeDbm: { readonly min: number; readonly max: number };
  readonly channelPower?: SpectrumAnalyzerChannelPowerCapability;
  readonly trigger?: SpectrumAnalyzerTriggerCapability;
  readonly limitLines?: SpectrumAnalyzerLimitCapability;
  readonly averaging?: SpectrumAnalyzerAveragingCapability;
  readonly presets?: InstrumentPresetCapability;

  // ---- primary setup ----
  getFrequency(): Promise<SpectrumAnalyzerFrequencyState>;
  setFrequency(input: SpectrumAnalyzerFrequencyInput): Promise<void>;
  getReferenceLevel(): Promise<SpectrumAnalyzerReferenceLevel>;
  setReferenceLevel(dbm: number): Promise<void>;
  getBandwidth(): Promise<SpectrumAnalyzerBandwidthState>;
  setBandwidth(input: SpectrumAnalyzerBandwidthInput): Promise<void>;
  getSweep(): Promise<SpectrumAnalyzerSweepState>;
  setSweep(input: SpectrumAnalyzerSweepInput): Promise<void>;
  singleSweep(): Promise<void>;

  // ---- traces + input + markers ----
  getTraceConfig(traceId: number): Promise<SpectrumAnalyzerTraceConfig>;
  setTraceConfig(
    traceId: number,
    config: Partial<Omit<SpectrumAnalyzerTraceConfig, "id">>,
  ): Promise<void>;
  readTrace(traceId: number): Promise<SpectrumAnalyzerTraceData>;

  getInput(): Promise<SpectrumAnalyzerInputState>;
  setInput(input: SpectrumAnalyzerInputInput): Promise<void>;

  listMarkers(): Promise<readonly SpectrumAnalyzerMarkerReading[]>;
  setMarker(id: number, config: SpectrumAnalyzerMarkerConfig): Promise<void>;
  readMarker(id: number): Promise<SpectrumAnalyzerMarkerReading>;
  peakSearch?(markerId: number): Promise<SpectrumAnalyzerMarkerReading>;

  // ---- capability-gated ----
  getChannelPower?(): Promise<SpectrumAnalyzerChannelPowerConfig>;
  setChannelPower?(config: SpectrumAnalyzerChannelPowerConfig): Promise<void>;
  readChannelPower?(): Promise<SpectrumAnalyzerChannelPowerReading>;

  getTrigger?(): Promise<SpectrumAnalyzerTriggerConfig>;
  setTrigger?(config: SpectrumAnalyzerTriggerConfig): Promise<void>;

  listLimitLines?(): Promise<readonly SpectrumAnalyzerLimitLine[]>;
  setLimitLine?(line: SpectrumAnalyzerLimitLine): Promise<void>;
  deleteLimitLine?(id: number): Promise<void>;
  readLimitResults?(): Promise<readonly SpectrumAnalyzerLimitResult[]>;

  getAveraging?(): Promise<SpectrumAnalyzerAveragingConfig>;
  setAveraging?(config: SpectrumAnalyzerAveragingConfig): Promise<void>;

  getPresetCatalog?(): Promise<readonly boolean[]>;
  savePreset?(slot: number): Promise<void>;
  recallPreset?(slot: number): Promise<void>;
}
