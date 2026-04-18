import type { InstrumentFacade } from "./base.js";

export interface PsuChannelLimits {
  readonly voltageMax: number;
  readonly currentMax: number;
}

export interface PsuChannelState {
  readonly id: number;
  readonly label: string;
  readonly setVoltage: number;
  readonly setCurrent: number;
  readonly measuredVoltage: number;
  readonly measuredCurrent: number;
  readonly output: boolean;
  readonly limits: PsuChannelLimits;
}

export interface PsuMeasurement {
  readonly channel: number;
  readonly voltage: number;
  readonly current: number;
  readonly power: number;
  readonly measuredAt: number;
}

/**
 * Channel coupling / pairing mode for multi-channel PSUs.
 *
 * - `off` — channels are independent (the default).
 * - `series` — two channels are internally wired in series, doubling the
 *   maximum voltage. Setting the paired channel drives both simultaneously.
 * - `parallel` — two channels are internally wired in parallel, doubling the
 *   maximum current.
 */
export type PsuPairingMode = "off" | "series" | "parallel";

export interface PsuPairingCapability {
  /** Modes this PSU can be switched into. Always includes `"off"`. */
  readonly modes: readonly PsuPairingMode[];
  /**
   * Which channel ids are involved when pairing is engaged. For the DP900
   * family this is `[1, 2]` — CH3 remains independent.
   */
  readonly channels: readonly number[];
}

/**
 * Kind of protection event. Over-voltage cuts output when the measured voltage
 * rises above the configured threshold; over-current does the same for current.
 */
export type PsuProtectionKind = "ovp" | "ocp";

export interface PsuProtectionRange {
  readonly min: number;
  readonly max: number;
}

export interface PsuProtectionState {
  readonly enabled: boolean;
  readonly level: number;
  readonly tripped: boolean;
  readonly range: PsuProtectionRange;
}

export interface PsuChannelProtectionRanges {
  readonly ovp: PsuProtectionRange;
  readonly ocp: PsuProtectionRange;
}

export interface PsuProtectionCapability {
  /** Channels that expose OVP/OCP controls. */
  readonly channels: readonly number[];
  /** Per-channel allowed range for each protection kind. */
  readonly ranges: Readonly<Record<number, PsuChannelProtectionRanges>>;
}

export interface PsuTrackingCapability {
  /**
   * Channels that mirror each other when tracking is enabled. DP900 tracks CH1
   * and CH2 only.
   */
  readonly channels: readonly number[];
}

export interface PsuPresetCapability {
  /** Number of internal memory slots, typically indexed 0..slots-1. */
  readonly slots: number;
}

export interface IPowerSupply extends InstrumentFacade {
  readonly kind: "powerSupply";
  /** Present only when the driver can toggle series/parallel pairing. */
  readonly pairing?: PsuPairingCapability;
  /** Present when the driver supports CH1/CH2 tracking. */
  readonly tracking?: PsuTrackingCapability;
  /** Present when the driver can read/configure OVP/OCP per channel. */
  readonly protection?: PsuProtectionCapability;
  /** Present when the driver exposes internal save/recall slots. */
  readonly presets?: PsuPresetCapability;
  getChannels(): Promise<PsuChannelState[]>;
  setChannelOutput(channel: number, enabled: boolean): Promise<void>;
  setChannelVoltage(channel: number, volts: number): Promise<void>;
  setChannelCurrent(channel: number, amps: number): Promise<void>;
  measureChannel(channel: number): Promise<PsuMeasurement>;
  /** Optional — read the current pairing mode. */
  getPairingMode?(): Promise<PsuPairingMode>;
  /** Optional — engage or disengage series/parallel pairing. */
  setPairingMode?(mode: PsuPairingMode): Promise<void>;
  /** Optional — read the tracking state. */
  getTracking?(): Promise<boolean>;
  /** Optional — enable or disable tracking. */
  setTracking?(enabled: boolean): Promise<void>;
  /** Optional — read the OVP or OCP state of a channel. */
  getProtection?(channel: number, kind: PsuProtectionKind): Promise<PsuProtectionState>;
  /** Optional — enable or disable a protection on a channel. */
  setProtectionEnabled?(
    channel: number,
    kind: PsuProtectionKind,
    enabled: boolean,
  ): Promise<void>;
  /** Optional — set the trip level of a protection on a channel. */
  setProtectionLevel?(
    channel: number,
    kind: PsuProtectionKind,
    level: number,
  ): Promise<void>;
  /** Optional — clear a latched protection event on a channel. */
  clearProtectionTrip?(channel: number, kind: PsuProtectionKind): Promise<void>;
  /**
   * Optional — return, in slot order, whether each preset memory slot is
   * populated.
   */
  getPresetCatalog?(): Promise<readonly boolean[]>;
  /** Optional — save the current instrument state to `slot`. */
  savePreset?(slot: number): Promise<void>;
  /** Optional — recall a previously saved state from `slot`. */
  recallPreset?(slot: number): Promise<void>;
}
