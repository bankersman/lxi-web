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

export interface IPowerSupply extends InstrumentFacade {
  readonly kind: "powerSupply";
  /** Present only when the driver can toggle series/parallel pairing. */
  readonly pairing?: PsuPairingCapability;
  getChannels(): Promise<PsuChannelState[]>;
  setChannelOutput(channel: number, enabled: boolean): Promise<void>;
  setChannelVoltage(channel: number, volts: number): Promise<void>;
  setChannelCurrent(channel: number, amps: number): Promise<void>;
  measureChannel(channel: number): Promise<PsuMeasurement>;
  /** Optional — read the current pairing mode. */
  getPairingMode?(): Promise<PsuPairingMode>;
  /** Optional — engage or disengage series/parallel pairing. */
  setPairingMode?(mode: PsuPairingMode): Promise<void>;
}
