import type { InstrumentFacade } from "./base.js";

export type MultimeterMode =
  | "dcVoltage"
  | "acVoltage"
  | "dcCurrent"
  | "acCurrent"
  | "resistance"
  | "frequency"
  | "capacitance"
  | "continuity"
  | "diode";

export const DEFAULT_MULTIMETER_UNITS: Readonly<Record<MultimeterMode, string>> = {
  dcVoltage: "V",
  acVoltage: "V",
  dcCurrent: "A",
  acCurrent: "A",
  resistance: "Ω",
  frequency: "Hz",
  capacitance: "F",
  continuity: "Ω",
  diode: "V",
};

export interface MultimeterReading {
  readonly value: number;
  readonly unit: string;
  readonly mode: MultimeterMode;
  readonly measuredAt: number;
  /** True when the instrument flagged an overload / out-of-range. */
  readonly overload?: boolean;
}

export interface IMultimeter extends InstrumentFacade {
  readonly kind: "multimeter";
  /** Modes this driver can switch into (static per-driver list). */
  readonly supportedModes: readonly MultimeterMode[];
  getMode(): Promise<MultimeterMode>;
  setMode(mode: MultimeterMode): Promise<void>;
  read(): Promise<MultimeterReading>;
}
