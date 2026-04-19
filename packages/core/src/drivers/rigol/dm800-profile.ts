import type { ScpiPort } from "../../scpi/port.js";
import type {
  MultimeterDualDisplayCapability,
  MultimeterMode,
  MultimeterRange,
  TemperatureTransducer,
} from "../../facades/multimeter.js";

/**
 * Variant-specific capability profile for the Rigol DM800 DMM family (DM858 /
 * DM858E). **Sourced from** `docs/vendor/rigol/DM858_SCPI_API_Reference.md`
 * — secondary pairings follow §3.17 `[SENSe]:…:SECondary` tables (only
 * measurement secondaries that map to `MultimeterMode` are listed; `CALC:DATA`
 * is not a separate mode in our facade).
 */
export interface Dm800Profile {
  readonly variant: string;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Partial<Record<MultimeterMode, readonly MultimeterRange[]>>;
  /** Doc §3.17 — NPLC for DC V, DC I, 2 Ω, 4 Ω (0.4 | 5 | 20 PLC); AC modes have no NPLC command. */
  readonly nplcOptions: readonly number[];
  readonly dbmReferences: readonly number[];
  readonly transducers: readonly TemperatureTransducer[];
  readonly dualDisplayPairs: MultimeterDualDisplayCapability["pairs"];
  readonly presetSlots: number;
}

const FULL_MODES: readonly MultimeterMode[] = [
  "dcVoltage",
  "acVoltage",
  "dcCurrent",
  "acCurrent",
  "resistance",
  "fourWireResistance",
  "frequency",
  "period",
  "capacitance",
  "continuity",
  "diode",
  "temperature",
];

const FULL_RANGES: Partial<Record<MultimeterMode, readonly MultimeterRange[]>> = {
  dcVoltage: [
    { label: "200 mV", upper: 0.2 },
    { label: "2 V", upper: 2 },
    { label: "20 V", upper: 20 },
    { label: "200 V", upper: 200 },
    { label: "1000 V", upper: 1000 },
  ],
  acVoltage: [
    { label: "200 mV", upper: 0.2 },
    { label: "2 V", upper: 2 },
    { label: "20 V", upper: 20 },
    { label: "200 V", upper: 200 },
    { label: "750 V", upper: 750 },
  ],
  dcCurrent: [
    { label: "200 µA", upper: 0.0002 },
    { label: "2 mA", upper: 0.002 },
    { label: "20 mA", upper: 0.02 },
    { label: "200 mA", upper: 0.2 },
    { label: "2 A", upper: 2 },
    { label: "10 A", upper: 10 },
  ],
  acCurrent: [
    { label: "200 µA", upper: 0.0002 },
    { label: "2 mA", upper: 0.002 },
    { label: "20 mA", upper: 0.02 },
    { label: "200 mA", upper: 0.2 },
    { label: "2 A", upper: 2 },
    { label: "10 A", upper: 10 },
  ],
  resistance: [
    { label: "200 Ω", upper: 200 },
    { label: "2 kΩ", upper: 2_000 },
    { label: "20 kΩ", upper: 20_000 },
    { label: "200 kΩ", upper: 200_000 },
    { label: "1 MΩ", upper: 1_000_000 },
    { label: "10 MΩ", upper: 10_000_000 },
    { label: "100 MΩ", upper: 100_000_000 },
  ],
  fourWireResistance: [
    { label: "200 Ω", upper: 200 },
    { label: "2 kΩ", upper: 2_000 },
    { label: "20 kΩ", upper: 20_000 },
    { label: "200 kΩ", upper: 200_000 },
    { label: "1 MΩ", upper: 1_000_000 },
    { label: "10 MΩ", upper: 10_000_000 },
    { label: "100 MΩ", upper: 100_000_000 },
  ],
  capacitance: [
    { label: "2 nF", upper: 2e-9 },
    { label: "20 nF", upper: 20e-9 },
    { label: "200 nF", upper: 200e-9 },
    { label: "2 µF", upper: 2e-6 },
    { label: "20 µF", upper: 20e-6 },
    { label: "200 µF", upper: 200e-6 },
    { label: "10 mF", upper: 10e-3 },
  ],
};

const FULL_TRANSDUCERS: readonly TemperatureTransducer[] = [
  "pt100",
  "pt1000",
  "thermocouple-k",
  "thermocouple-j",
  "thermocouple-t",
  "thermocouple-e",
  "thermistor",
];

/**
 * §3.17 SECondary: only entries that map to another `MultimeterMode`.
 * (Many primaries only allow `CALC:DATA` as secondary — omitted here.)
 */
const FULL_DUAL_DISPLAY: MultimeterDualDisplayCapability["pairs"] = {
  acVoltage: ["frequency", "period"],
  acCurrent: ["frequency", "period"],
  frequency: ["acVoltage"],
  period: ["acVoltage"],
};

/** Doc §3.17.63 / §3.17.18 / resistance & FRES NPLC tables: 0.4, 5, 20 PLC. */
const STANDARD_NPLC: readonly number[] = [0.4, 5, 20];

const STANDARD_DBM_REF: readonly number[] = [
  50, 75, 93, 110, 124, 125, 135, 150, 250, 300, 500, 600, 800, 900, 1000, 1200, 8000,
];

export const DM800_VARIANTS: readonly Dm800Profile[] = [
  {
    variant: "DM858",
    modes: FULL_MODES,
    ranges: FULL_RANGES,
    nplcOptions: STANDARD_NPLC,
    dbmReferences: STANDARD_DBM_REF,
    transducers: FULL_TRANSDUCERS,
    dualDisplayPairs: FULL_DUAL_DISPLAY,
    presetSlots: 10,
  },
  {
    variant: "DM858E",
    modes: FULL_MODES.filter((m) => m !== "fourWireResistance"),
    ranges: { ...FULL_RANGES, fourWireResistance: undefined },
    nplcOptions: STANDARD_NPLC,
    dbmReferences: STANDARD_DBM_REF,
    transducers: FULL_TRANSDUCERS,
    dualDisplayPairs: FULL_DUAL_DISPLAY,
    presetSlots: 10,
  },
];

export const DM800_DEFAULT: Dm800Profile = {
  variant: "DM8xx",
  modes: FULL_MODES,
  ranges: FULL_RANGES,
  nplcOptions: STANDARD_NPLC,
  dbmReferences: STANDARD_DBM_REF,
  transducers: FULL_TRANSDUCERS,
  dualDisplayPairs: FULL_DUAL_DISPLAY,
  presetSlots: 10,
};

/**
 * DM858 / DM858E firmware does not implement `*OPT?` reliably; querying it can
 * return SCPI error -295 (invalid memory access). We therefore skip option
 * probing. DM858E without the 4-wire license must use the conservative
 * DM858E variant profile (no `fourWireResistance`); licensed units are not
 * auto-detected.
 */
export async function refineDm800Profile(
  base: Dm800Profile,
  _port: ScpiPort,
): Promise<Dm800Profile> {
  return base;
}
