import type { InstrumentFacade } from "./base.js";
import type {
  InstrumentPresetCapability,
  MultimeterLoggingCapability,
  MultimeterLoggingConfig,
  MultimeterLoggingSample,
  MultimeterLoggingStatus,
} from "./multimeter.js";

/**
 * Operating modes for an electronic load. Rigol DL3000 and Siglent SDL both
 * expose the same four; vendors that add niche modes (CV-CC, LED, solar cell
 * emulation) should extend this as an optional capability rather than
 * overload one of the core modes.
 */
export type ElectronicLoadMode = "cc" | "cv" | "cr" | "cp";

export interface ElectronicLoadLimits {
  readonly voltageMax: number;
  readonly currentMax: number;
  readonly powerMax: number;
  /**
   * Allowed resistance range in CR mode (ohms). Wide range: e.g. Rigol
   * DL3021 is 0.1 Ω ... 7.5 kΩ depending on the configured range tier.
   */
  readonly resistanceRange: { readonly min: number; readonly max: number };
}

/** Live per-setpoint values across every mode, even the inactive ones. */
export interface ElectronicLoadSetpoints {
  readonly cc: number;
  readonly cv: number;
  readonly cr: number;
  readonly cp: number;
}

/** One-shot measurement snapshot. */
export interface ElectronicLoadMeasurement {
  readonly voltage: number;
  readonly current: number;
  readonly power: number;
  readonly resistance: number;
  readonly measuredAt: number;
}

export type ElectronicLoadProtectionKind = "ovp" | "ocp" | "opp" | "otp";

export interface ElectronicLoadProtectionRange {
  readonly min: number;
  readonly max: number;
}

export interface ElectronicLoadProtectionState {
  readonly enabled: boolean;
  readonly level: number;
  readonly tripped: boolean;
  readonly range: ElectronicLoadProtectionRange;
}

export interface ElectronicLoadProtectionCapability {
  readonly kinds: readonly ElectronicLoadProtectionKind[];
  readonly ranges: Readonly<
    Record<ElectronicLoadProtectionKind, ElectronicLoadProtectionRange>
  >;
}

/** A/B dynamic (pulse-load) setpoint configuration. */
export interface ElectronicLoadDynamicConfig {
  readonly levelA: number;
  readonly levelB: number;
  /** Hold time at each level (seconds). */
  readonly timeA: number;
  readonly timeB: number;
  /** Edge slew rate in A/µs. 0 = instrument default. */
  readonly slewRate: number;
  /** Shown for monitoring / UI hint; derived from timeA+timeB when 0. */
  readonly frequencyHz: number;
  readonly enabled: boolean;
}

export interface ElectronicLoadDynamicCapability {
  /** Supported modes the dynamic engine can switch between. */
  readonly modes: readonly ElectronicLoadMode[];
  /** Maximum slew rate (A/µs). */
  readonly slewRateMax: number;
  /** Allowed dwell time per level (seconds). */
  readonly timeRange: { readonly min: number; readonly max: number };
}

export interface ElectronicLoadBatteryConfig {
  /** Discharge mode: constant current, constant resistance, or constant power. */
  readonly mode: "cc" | "cr" | "cp";
  /** Discharge current / power / resistance, per the selected mode. */
  readonly level: number;
  /** Stop when the DUT sags to this voltage. */
  readonly cutoffVoltage: number;
  /** Stop when total drained capacity reaches this (Ah). */
  readonly cutoffCapacity: number;
  /** Stop after this many seconds. */
  readonly cutoffTimeSec: number;
}

export interface ElectronicLoadBatteryState {
  readonly running: boolean;
  readonly config: ElectronicLoadBatteryConfig;
  readonly elapsedSec: number;
  /** Accumulated charge removed (Ah). */
  readonly capacity: number;
  /** Accumulated energy removed (Wh). */
  readonly energy: number;
  /** Reason the run stopped (or null if still running). */
  readonly stoppedBy: "user" | "voltage" | "capacity" | "time" | null;
}

export interface ElectronicLoadBatteryCapability {
  readonly modes: readonly ("cc" | "cr" | "cp")[];
  readonly cutoffVoltageRange: { readonly min: number; readonly max: number };
  readonly cutoffCapacityRange: { readonly min: number; readonly max: number };
  readonly cutoffTimeRangeSec: { readonly min: number; readonly max: number };
}

export interface ElectronicLoadState {
  readonly enabled: boolean;
  readonly mode: ElectronicLoadMode;
  readonly setpoints: ElectronicLoadSetpoints;
  readonly measurement: ElectronicLoadMeasurement;
  readonly limits: ElectronicLoadLimits;
  readonly protection?: Readonly<
    Partial<Record<ElectronicLoadProtectionKind, ElectronicLoadProtectionState>>
  >;
}

export interface IElectronicLoad extends InstrumentFacade {
  readonly kind: "electronicLoad";
  readonly limits: ElectronicLoadLimits;
  /** Present on drivers that implement OVP/OCP/OPP/OTP. */
  readonly protection?: ElectronicLoadProtectionCapability;
  /** Present on drivers that implement the pulse-load engine. */
  readonly dynamic?: ElectronicLoadDynamicCapability;
  /** Present on drivers that implement battery-discharge mode. */
  readonly battery?: ElectronicLoadBatteryCapability;
  /** Present on drivers that can stream buffered measurements. */
  readonly logging?: MultimeterLoggingCapability;
  /** Present on drivers that expose `*SAV` / `*RCL` slots. */
  readonly presets?: InstrumentPresetCapability;

  getState(): Promise<ElectronicLoadState>;
  setInputEnabled(enabled: boolean): Promise<void>;
  setMode(mode: ElectronicLoadMode): Promise<void>;
  setSetpoint(mode: ElectronicLoadMode, value: number): Promise<void>;
  getSetpoints(): Promise<ElectronicLoadSetpoints>;
  measure(): Promise<ElectronicLoadMeasurement>;

  // --- protection (all optional; presence gated by `protection`) ---
  getProtection?(
    kind: ElectronicLoadProtectionKind,
  ): Promise<ElectronicLoadProtectionState>;
  setProtectionEnabled?(
    kind: ElectronicLoadProtectionKind,
    enabled: boolean,
  ): Promise<void>;
  setProtectionLevel?(
    kind: ElectronicLoadProtectionKind,
    level: number,
  ): Promise<void>;
  clearProtectionTrip?(kind: ElectronicLoadProtectionKind): Promise<void>;

  // --- dynamic / pulse-load ---
  getDynamicConfig?(): Promise<ElectronicLoadDynamicConfig>;
  setDynamicConfig?(config: ElectronicLoadDynamicConfig): Promise<void>;

  // --- battery ---
  getBatteryState?(): Promise<ElectronicLoadBatteryState>;
  startBattery?(config: ElectronicLoadBatteryConfig): Promise<void>;
  stopBattery?(): Promise<void>;

  // --- logging (reuses DMM shape from 2.6c) ---
  startLogging?(config: MultimeterLoggingConfig): Promise<{ runId: string }>;
  stopLogging?(): Promise<void>;
  getLoggingStatus?(): Promise<MultimeterLoggingStatus>;
  fetchLoggedSamples?(
    runId: string,
    since?: number,
  ): Promise<readonly MultimeterLoggingSample[]>;

  // --- presets ---
  getPresetCatalog?(): Promise<readonly boolean[]>;
  savePreset?(slot: number): Promise<void>;
  recallPreset?(slot: number): Promise<void>;
}
