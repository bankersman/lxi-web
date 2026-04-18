import type { InstrumentFacade } from "./base.js";
import type { OutputKillResult } from "./output-kill.js";
import type { InstrumentPresetCapability } from "./multimeter.js";

/**
 * Output impedance of a signal-generator channel. Selecting the wrong option
 * is a very common UI footgun — the generator doubles every displayed
 * amplitude when it thinks the load is high-Z — so the setting is surfaced
 * as a first-class control rather than a hidden preference.
 */
export type SignalGeneratorOutputImpedance = "50ohm" | "highZ";

/** Base shape shared by every waveform type. */
export interface SignalGeneratorBaseWaveform {
  readonly frequencyHz: number;
  readonly amplitudeVpp: number;
  readonly offsetV: number;
  readonly phaseDeg?: number;
}

export interface SignalGeneratorSineWaveform extends SignalGeneratorBaseWaveform {
  readonly type: "sine";
}

export interface SignalGeneratorSquareWaveform extends SignalGeneratorBaseWaveform {
  readonly type: "square";
  /** Duty cycle 0..100. Defaults to 50 if omitted. */
  readonly dutyPct?: number;
}

export interface SignalGeneratorRampWaveform extends SignalGeneratorBaseWaveform {
  readonly type: "ramp";
  /** Symmetry 0..100; 50 is a triangle. */
  readonly symmetryPct?: number;
}

export interface SignalGeneratorPulseWaveform extends SignalGeneratorBaseWaveform {
  readonly type: "pulse";
  /** High-time in seconds. */
  readonly widthS?: number;
  /** Leading-edge transition time in seconds. */
  readonly riseTimeS?: number;
  /** Trailing-edge transition time in seconds. */
  readonly fallTimeS?: number;
}

export interface SignalGeneratorNoiseWaveform {
  readonly type: "noise";
  /** Peak-to-peak amplitude; frequency is meaningless for noise. */
  readonly amplitudeVpp: number;
  readonly offsetV: number;
}

export interface SignalGeneratorDcWaveform {
  readonly type: "dc";
  readonly offsetV: number;
}

export interface SignalGeneratorArbitraryWaveform extends SignalGeneratorBaseWaveform {
  readonly type: "arbitrary";
  /**
   * Name of a built-in arbitrary waveform (vendor-defined library). Mutually
   * exclusive with `sampleId`.
   */
  readonly builtinName?: string;
  /**
   * Identifier of a user-uploaded sample (see `uploadArbitrary` on the
   * capability). Mutually exclusive with `builtinName`.
   */
  readonly sampleId?: string;
}

export type SignalGeneratorWaveform =
  | SignalGeneratorSineWaveform
  | SignalGeneratorSquareWaveform
  | SignalGeneratorRampWaveform
  | SignalGeneratorPulseWaveform
  | SignalGeneratorNoiseWaveform
  | SignalGeneratorDcWaveform
  | SignalGeneratorArbitraryWaveform;

export type SignalGeneratorWaveformType = SignalGeneratorWaveform["type"];

export interface SignalGeneratorChannelLimits {
  readonly frequencyMaxHz: number;
  readonly amplitudeRangeVpp: { readonly min: number; readonly max: number };
  readonly offsetRangeV: { readonly min: number; readonly max: number };
  readonly outputImpedanceModes: readonly SignalGeneratorOutputImpedance[];
  readonly supportedWaveforms: readonly SignalGeneratorWaveformType[];
}

export interface SignalGeneratorChannelState {
  readonly id: number;
  readonly label: string;
  readonly enabled: boolean;
  readonly impedance: SignalGeneratorOutputImpedance;
  readonly waveform: SignalGeneratorWaveform;
  /**
   * Actual applied values, which may differ from the requested waveform when
   * the instrument clamps or rounds a setpoint.
   */
  readonly actual: SignalGeneratorActualSetpoints;
  readonly limits: SignalGeneratorChannelLimits;
}

export interface SignalGeneratorActualSetpoints {
  readonly frequencyHz: number;
  readonly amplitudeVpp: number;
  readonly offsetV: number;
}

export interface SignalGeneratorChannelsCapability {
  readonly channels: readonly SignalGeneratorChannelLimits[];
}

// ---- Modulation ---------------------------------------------------------

export type SignalGeneratorModulationType =
  | "am"
  | "fm"
  | "pm"
  | "pwm"
  | "fsk"
  | "ask"
  | "psk";

export type SignalGeneratorModulationSource = "internal" | "external";

/**
 * Modulating-waveform shapes. A subset of the carrier waveform set; shared
 * on purpose so a UI can re-use its waveform picker when binding the
 * modulating source.
 */
export type SignalGeneratorModulationWaveform =
  | "sine"
  | "square"
  | "triangle"
  | "ramp"
  | "noise";

export interface SignalGeneratorModulationConfig {
  readonly enabled: boolean;
  readonly type: SignalGeneratorModulationType;
  readonly source: SignalGeneratorModulationSource;
  /**
   * Depth interpretation depends on `type`: AM percent, FM deviation Hz,
   * PM deviation deg, PWM deviation percent, FSK hop frequency Hz,
   * ASK/PSK hop magnitude/phase.
   */
  readonly depth: number;
  readonly modulatingFrequencyHz: number;
  readonly modulatingWaveform: SignalGeneratorModulationWaveform;
}

export interface SignalGeneratorModulationCapability {
  readonly types: readonly SignalGeneratorModulationType[];
  readonly sources: readonly SignalGeneratorModulationSource[];
  readonly waveforms: readonly SignalGeneratorModulationWaveform[];
  readonly depthRange: Readonly<
    Record<SignalGeneratorModulationType, { readonly min: number; readonly max: number }>
  >;
  readonly modulatingFrequencyRangeHz: { readonly min: number; readonly max: number };
}

// ---- Sweep --------------------------------------------------------------

export type SignalGeneratorSweepSpacing = "linear" | "logarithmic";
export type SignalGeneratorSweepTrigger = "immediate" | "external" | "manual";

export interface SignalGeneratorSweepConfig {
  readonly enabled: boolean;
  readonly startHz: number;
  readonly stopHz: number;
  readonly timeSec: number;
  readonly spacing: SignalGeneratorSweepSpacing;
  readonly trigger: SignalGeneratorSweepTrigger;
}

export interface SignalGeneratorSweepCapability {
  readonly spacings: readonly SignalGeneratorSweepSpacing[];
  readonly triggers: readonly SignalGeneratorSweepTrigger[];
  readonly timeRangeSec: { readonly min: number; readonly max: number };
}

// ---- Burst --------------------------------------------------------------

export type SignalGeneratorBurstMode = "triggered" | "gated" | "nCycle";
export type SignalGeneratorBurstTrigger = "immediate" | "external" | "manual";

export interface SignalGeneratorBurstConfig {
  readonly enabled: boolean;
  readonly mode: SignalGeneratorBurstMode;
  /** Cycle count for `triggered` / `nCycle`; ignored for `gated`. */
  readonly cycles: number;
  /** Internal trigger period in seconds (used when trigger is immediate). */
  readonly periodSec: number;
  readonly trigger: SignalGeneratorBurstTrigger;
  /** Absolute phase at burst start (degrees). */
  readonly startPhaseDeg: number;
}

export interface SignalGeneratorBurstCapability {
  readonly modes: readonly SignalGeneratorBurstMode[];
  readonly triggers: readonly SignalGeneratorBurstTrigger[];
  readonly cyclesRange: { readonly min: number; readonly max: number };
}

// ---- Arbitrary-waveform ------------------------------------------------

export interface SignalGeneratorArbitrarySample {
  readonly id: string;
  readonly name: string;
  readonly sampleCount: number;
}

export interface SignalGeneratorArbitraryCapability {
  readonly maxSamples: number;
  /** Built-in arbitrary waveform names exposed by the instrument firmware. */
  readonly builtins: readonly string[];
  /** Minimum / maximum sample rate in Sa/s. */
  readonly sampleRateRange: { readonly min: number; readonly max: number };
}

export interface SignalGeneratorArbitraryUploadResult {
  readonly sampleId: string;
  readonly sampleCount: number;
}

// ---- Sync ---------------------------------------------------------------

export interface SignalGeneratorSyncState {
  readonly phaseAligned: boolean;
  readonly commonClockEnabled: boolean;
}

export interface SignalGeneratorSyncCapability {
  /** Which channels can be phase-aligned — typically `[1, 2]`. */
  readonly channels: readonly number[];
  /** Whether this generator can be slaved to an external 10 MHz reference. */
  readonly hasCommonClock: boolean;
}

// ---- Facade -------------------------------------------------------------

export interface ISignalGenerator extends InstrumentFacade {
  readonly kind: "signalGenerator";
  /** One entry per channel, index 0 = channel 1. Always present. */
  readonly channels: SignalGeneratorChannelsCapability;
  readonly modulation?: SignalGeneratorModulationCapability;
  readonly sweep?: SignalGeneratorSweepCapability;
  readonly burst?: SignalGeneratorBurstCapability;
  readonly arbitrary?: SignalGeneratorArbitraryCapability;
  readonly sync?: SignalGeneratorSyncCapability;
  readonly presets?: InstrumentPresetCapability;

  getChannels(): Promise<readonly SignalGeneratorChannelState[]>;
  getChannelState(channel: number): Promise<SignalGeneratorChannelState>;
  getChannelStatus(channel: number): Promise<SignalGeneratorActualSetpoints>;
  setChannelEnabled(channel: number, enabled: boolean): Promise<void>;
  setWaveform(channel: number, config: SignalGeneratorWaveform): Promise<void>;
  setOutputImpedance(
    channel: number,
    mode: SignalGeneratorOutputImpedance,
  ): Promise<void>;

  // ---- modulation (optional, gated on `modulation`) ----
  getModulation?(channel: number): Promise<SignalGeneratorModulationConfig>;
  setModulation?(
    channel: number,
    config: SignalGeneratorModulationConfig,
  ): Promise<void>;

  // ---- sweep ----
  getSweep?(channel: number): Promise<SignalGeneratorSweepConfig>;
  setSweep?(channel: number, config: SignalGeneratorSweepConfig): Promise<void>;

  // ---- burst ----
  getBurst?(channel: number): Promise<SignalGeneratorBurstConfig>;
  setBurst?(channel: number, config: SignalGeneratorBurstConfig): Promise<void>;

  // ---- arbitrary ----
  listArbitrarySamples?(): Promise<readonly SignalGeneratorArbitrarySample[]>;
  uploadArbitrary?(
    channel: number,
    name: string,
    samples: Float32Array | Int16Array,
  ): Promise<SignalGeneratorArbitraryUploadResult>;
  deleteArbitrary?(sampleId: string): Promise<void>;

  // ---- sync ----
  getSync?(): Promise<SignalGeneratorSyncState>;
  alignPhase?(): Promise<void>;
  setCommonClock?(enabled: boolean): Promise<void>;

  // ---- presets ----
  getPresetCatalog?(): Promise<readonly boolean[]>;
  savePreset?(slot: number): Promise<void>;
  recallPreset?(slot: number): Promise<void>;

  /** Epic 5.2 — disable every RF/output channel (panic stop). */
  disableAllOutputs?(): Promise<OutputKillResult>;
}
