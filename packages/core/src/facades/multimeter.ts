import type { InstrumentFacade } from "./base.js";

export type MultimeterMode =
  | "dcVoltage"
  | "acVoltage"
  | "dcCurrent"
  | "acCurrent"
  | "resistance"
  | "fourWireResistance"
  | "frequency"
  | "period"
  | "capacitance"
  | "continuity"
  | "diode"
  | "temperature";

export const DEFAULT_MULTIMETER_UNITS: Readonly<Record<MultimeterMode, string>> = {
  dcVoltage: "V",
  acVoltage: "V",
  dcCurrent: "A",
  acCurrent: "A",
  resistance: "Ω",
  fourWireResistance: "Ω",
  frequency: "Hz",
  period: "s",
  capacitance: "F",
  continuity: "Ω",
  diode: "V",
  temperature: "°C",
};

export interface MultimeterReading {
  readonly value: number;
  readonly unit: string;
  readonly mode: MultimeterMode;
  readonly measuredAt: number;
  /** True when the instrument flagged an overload / out-of-range. */
  readonly overload?: boolean;
}

// ---- 2.6a — ranging / NPLC / triggering ----

export interface MultimeterRange {
  readonly label: string;
  readonly upper: number;
  readonly resolution?: number;
}

export interface MultimeterRangingCapability {
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Readonly<Partial<Record<MultimeterMode, readonly MultimeterRange[]>>>;
  readonly nplc: readonly number[];
  readonly autoZero: boolean;
}

export interface MultimeterRangeState {
  readonly mode: MultimeterMode;
  readonly upper: number;
  readonly auto: boolean;
}

export type MultimeterAutoZero = "on" | "off" | "once";

export type MultimeterTriggerSource = "immediate" | "external" | "bus" | "software";
export type MultimeterTriggerSlope = "positive" | "negative";

export interface MultimeterTriggerCapability {
  readonly sources: readonly MultimeterTriggerSource[];
  readonly slopes: readonly MultimeterTriggerSlope[];
  readonly sampleCountRange: { readonly min: number; readonly max: number };
  readonly delayRangeSec: { readonly min: number; readonly max: number };
}

export interface MultimeterTriggerConfig {
  readonly source: MultimeterTriggerSource;
  readonly slope: MultimeterTriggerSlope;
  readonly delaySec: number;
  readonly sampleCount: number;
}

// ---- 2.6b — math + dual display ----

export type MultimeterMathFunction =
  | "none" | "null" | "db" | "dbm" | "stats" | "limit";

export interface MultimeterMathCapability {
  readonly functions: readonly MultimeterMathFunction[];
  readonly allowedModes: Readonly<
    Partial<Record<MultimeterMathFunction, readonly MultimeterMode[]>>
  >;
  readonly dbmReferences: readonly number[];
}

export interface MultimeterMathConfig {
  readonly function: MultimeterMathFunction;
  readonly nullOffset?: number;
  readonly dbmReference?: number;
  readonly limitUpper?: number;
  readonly limitLower?: number;
}

export interface MultimeterMathStatistics {
  readonly min: number;
  readonly max: number;
  readonly average: number;
  readonly stddev: number;
  readonly count: number;
}

export type MultimeterLimitResult = "pass" | "fail-high" | "fail-low";

export interface MultimeterMathState {
  readonly config: MultimeterMathConfig;
  readonly stats?: MultimeterMathStatistics;
  readonly limitResult?: MultimeterLimitResult;
}

export interface MultimeterDualDisplayCapability {
  readonly pairs: Readonly<Partial<Record<MultimeterMode, readonly MultimeterMode[]>>>;
}

export interface MultimeterDualReading {
  readonly primary: MultimeterReading;
  readonly secondary: MultimeterReading;
}

// ---- 2.6c — trend logging / temperature / presets ----

export interface MultimeterLoggingCapability {
  readonly maxSamples: number;
  readonly minIntervalMs: number;
}

export interface MultimeterLoggingConfig {
  readonly intervalMs: number;
  readonly totalSamples?: number;
}

export interface MultimeterLoggingSample {
  readonly seq: number;
  readonly value: number;
  readonly unit: string;
  readonly mode: MultimeterMode;
  readonly timestamp: number;
  readonly elapsedMs: number;
}

export interface MultimeterLoggingStatus {
  readonly running: boolean;
  readonly runId?: string;
  readonly config?: MultimeterLoggingConfig;
  readonly samplesEmitted: number;
  readonly samplesRemaining?: number;
  readonly startedAt?: number;
}

export type TemperatureUnit = "celsius" | "fahrenheit" | "kelvin";
export type TemperatureTransducer =
  | "pt100"
  | "pt1000"
  | "thermocouple-k"
  | "thermocouple-j"
  | "thermocouple-t"
  | "thermocouple-e"
  | "thermistor";

export interface MultimeterTemperatureCapability {
  readonly units: readonly TemperatureUnit[];
  readonly transducers: readonly TemperatureTransducer[];
}

export interface MultimeterTemperatureConfig {
  readonly unit: TemperatureUnit;
  readonly transducer: TemperatureTransducer;
}

/**
 * Shared preset shape used by PSU (2.5), DMM (2.6c) and scope (2.7c) drivers.
 * Each driver describes how many internal save/recall slots it has; the UI
 * surfaces a numbered-slot grid regardless of device kind.
 */
export interface InstrumentPresetCapability {
  readonly slots: number;
}

// ---- Interface ----

export interface IMultimeter extends InstrumentFacade {
  readonly kind: "multimeter";
  readonly supportedModes: readonly MultimeterMode[];

  // Optional capability descriptors.
  readonly ranging?: MultimeterRangingCapability;
  readonly triggering?: MultimeterTriggerCapability;
  readonly math?: MultimeterMathCapability;
  readonly dualDisplay?: MultimeterDualDisplayCapability;
  readonly logging?: MultimeterLoggingCapability;
  readonly temperature?: MultimeterTemperatureCapability;
  readonly presets?: InstrumentPresetCapability;

  getMode(): Promise<MultimeterMode>;
  setMode(mode: MultimeterMode): Promise<void>;
  read(): Promise<MultimeterReading>;

  // 2.6a
  getRange?(): Promise<MultimeterRangeState>;
  setRange?(mode: MultimeterMode, range: number | "auto"): Promise<void>;
  getNplc?(): Promise<number>;
  setNplc?(value: number): Promise<void>;
  setAutoZero?(mode: MultimeterAutoZero): Promise<void>;
  getTriggerConfig?(): Promise<MultimeterTriggerConfig>;
  setTriggerConfig?(config: MultimeterTriggerConfig): Promise<void>;
  trigger?(): Promise<void>;

  // 2.6b
  getMath?(): Promise<MultimeterMathState>;
  setMath?(config: MultimeterMathConfig): Promise<void>;
  fetchMathState?(): Promise<MultimeterMathState>;
  resetMathStatistics?(): Promise<void>;
  getDualDisplay?(): Promise<MultimeterMode | null>;
  setDualDisplay?(secondary: MultimeterMode | null): Promise<void>;
  readDual?(): Promise<MultimeterDualReading>;

  // 2.6c
  startLogging?(config: MultimeterLoggingConfig): Promise<{ runId: string }>;
  stopLogging?(): Promise<void>;
  getLoggingStatus?(): Promise<MultimeterLoggingStatus>;
  fetchLoggedSamples?(runId: string, since?: number): Promise<readonly MultimeterLoggingSample[]>;
  getTemperatureConfig?(): Promise<MultimeterTemperatureConfig>;
  setTemperatureConfig?(config: MultimeterTemperatureConfig): Promise<void>;
  getPresetCatalog?(): Promise<readonly boolean[]>;
  savePreset?(slot: number): Promise<void>;
  recallPreset?(slot: number): Promise<void>;
}
