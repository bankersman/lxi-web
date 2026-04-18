import type { ScpiPort } from "../../scpi/port.js";
import type {
  MultimeterDualDisplayCapability,
  MultimeterMode,
  MultimeterRange,
  TemperatureTransducer,
} from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant-specific profile for the Keysight Truevolt 34400A range
 * (34450A / 34461A / 34465A / 34470A) plus the legacy Agilent
 * 34410A / 34411A which share enough SCPI to live in the same driver.
 *
 * What differs between digits:
 *   - display digit count → the mode set (no 4-wire on 34450A's 5½)
 *   - per-mode range tables (200 mV ... 1000 V for V_DC etc.)
 *   - NPLC menu (34470A adds 100 PLC; 34450A / 34410A drop sub-PLC)
 *   - dual-display pairings (34461A and up; the 34450A does not)
 *   - optional firmware packs (DIG = digitize, TEMP = temperature,
 *     HIST = histogram, STG = data logger) surfaced via `*OPT?`.
 */
export interface TrueVoltProfile {
  readonly variant: string;
  readonly displayDigits: number;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Partial<Record<MultimeterMode, readonly MultimeterRange[]>>;
  readonly nplcOptions: readonly number[];
  readonly dbmReferences: readonly number[];
  readonly transducers: readonly TemperatureTransducer[];
  readonly dualDisplayPairs: MultimeterDualDisplayCapability["pairs"];
  readonly presetSlots: number;
}

const BASE_MODES: readonly MultimeterMode[] = [
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

const DC_VOLTAGE_RANGES: readonly MultimeterRange[] = [
  { label: "100 mV", upper: 0.1 },
  { label: "1 V", upper: 1 },
  { label: "10 V", upper: 10 },
  { label: "100 V", upper: 100 },
  { label: "1000 V", upper: 1000 },
];

const AC_VOLTAGE_RANGES: readonly MultimeterRange[] = [
  { label: "100 mV", upper: 0.1 },
  { label: "1 V", upper: 1 },
  { label: "10 V", upper: 10 },
  { label: "100 V", upper: 100 },
  { label: "750 V", upper: 750 },
];

const CURRENT_RANGES: readonly MultimeterRange[] = [
  { label: "100 µA", upper: 0.0001 },
  { label: "1 mA", upper: 0.001 },
  { label: "10 mA", upper: 0.01 },
  { label: "100 mA", upper: 0.1 },
  { label: "1 A", upper: 1 },
  { label: "3 A", upper: 3 },
  { label: "10 A", upper: 10 },
];

const RESISTANCE_RANGES: readonly MultimeterRange[] = [
  { label: "100 Ω", upper: 100 },
  { label: "1 kΩ", upper: 1_000 },
  { label: "10 kΩ", upper: 10_000 },
  { label: "100 kΩ", upper: 100_000 },
  { label: "1 MΩ", upper: 1_000_000 },
  { label: "10 MΩ", upper: 10_000_000 },
  { label: "100 MΩ", upper: 100_000_000 },
  { label: "1 GΩ", upper: 1_000_000_000 },
];

const CAPACITANCE_RANGES: readonly MultimeterRange[] = [
  { label: "1 nF", upper: 1e-9 },
  { label: "10 nF", upper: 10e-9 },
  { label: "100 nF", upper: 100e-9 },
  { label: "1 µF", upper: 1e-6 },
  { label: "10 µF", upper: 10e-6 },
  { label: "100 µF", upper: 100e-6 },
];

const FULL_RANGES: Partial<Record<MultimeterMode, readonly MultimeterRange[]>> = {
  dcVoltage: DC_VOLTAGE_RANGES,
  acVoltage: AC_VOLTAGE_RANGES,
  dcCurrent: CURRENT_RANGES,
  acCurrent: CURRENT_RANGES,
  resistance: RESISTANCE_RANGES,
  fourWireResistance: RESISTANCE_RANGES,
  capacitance: CAPACITANCE_RANGES,
};

const TRANSDUCERS: readonly TemperatureTransducer[] = [
  "pt100",
  "pt1000",
  "thermocouple-k",
  "thermocouple-j",
  "thermocouple-t",
  "thermocouple-e",
  "thermistor",
];

const DUAL_DISPLAY_FULL: MultimeterDualDisplayCapability["pairs"] = {
  dcVoltage: ["acVoltage", "frequency"],
  acVoltage: ["dcVoltage", "frequency"],
  dcCurrent: ["acCurrent", "frequency"],
  acCurrent: ["dcCurrent", "frequency"],
  frequency: ["period", "acVoltage"],
  period: ["frequency"],
  resistance: ["continuity"],
  fourWireResistance: ["continuity"],
  temperature: ["resistance"],
};

const NPLC_55: readonly number[] = [0.02, 0.2, 1, 10, 100];
const NPLC_65: readonly number[] = [0.02, 0.2, 1, 10, 100];
const NPLC_75: readonly number[] = [0.02, 0.2, 1, 10, 100];
const NPLC_34450A: readonly number[] = [0.006, 0.06, 0.2, 1, 10];

const DBM_REF: readonly number[] = [50, 75, 93, 110, 124, 135, 150, 250, 300, 500, 600, 800, 1000];

export const TRUEVOLT_VARIANTS: readonly TrueVoltProfile[] = [
  {
    variant: "34450A",
    displayDigits: 5.5,
    modes: BASE_MODES.filter((m) => m !== "fourWireResistance"),
    ranges: { ...FULL_RANGES, fourWireResistance: undefined },
    nplcOptions: NPLC_34450A,
    dbmReferences: DBM_REF,
    transducers: ["pt100", "pt1000", "thermocouple-k"],
    dualDisplayPairs: {},
    presetSlots: 5,
  },
  {
    variant: "34461A",
    displayDigits: 6.5,
    modes: BASE_MODES,
    ranges: FULL_RANGES,
    nplcOptions: NPLC_65,
    dbmReferences: DBM_REF,
    transducers: TRANSDUCERS,
    dualDisplayPairs: DUAL_DISPLAY_FULL,
    presetSlots: 5,
  },
  {
    variant: "34465A",
    displayDigits: 6.5,
    modes: BASE_MODES,
    ranges: FULL_RANGES,
    nplcOptions: NPLC_65,
    dbmReferences: DBM_REF,
    transducers: TRANSDUCERS,
    dualDisplayPairs: DUAL_DISPLAY_FULL,
    presetSlots: 5,
  },
  {
    variant: "34470A",
    displayDigits: 7.5,
    modes: BASE_MODES,
    ranges: FULL_RANGES,
    nplcOptions: NPLC_75,
    dbmReferences: DBM_REF,
    transducers: TRANSDUCERS,
    dualDisplayPairs: DUAL_DISPLAY_FULL,
    presetSlots: 5,
  },
  {
    // Legacy Agilent 34410A — SCPI superset of 34401A with LXI added;
    // trimmed mode set (no capacitance / temperature on the vanilla
    // firmware; options enable them).
    variant: "34410A",
    displayDigits: 6.5,
    modes: BASE_MODES.filter(
      (m) => m !== "capacitance" && m !== "temperature",
    ),
    ranges: {
      ...FULL_RANGES,
      capacitance: undefined,
    },
    nplcOptions: NPLC_55,
    dbmReferences: DBM_REF,
    transducers: [],
    dualDisplayPairs: {},
    presetSlots: 5,
  },
  {
    // 34411A is the 34410A's higher-speed sibling; shares the dialect.
    variant: "34411A",
    displayDigits: 6.5,
    modes: BASE_MODES.filter(
      (m) => m !== "capacitance" && m !== "temperature",
    ),
    ranges: {
      ...FULL_RANGES,
      capacitance: undefined,
    },
    nplcOptions: NPLC_55,
    dbmReferences: DBM_REF,
    transducers: [],
    dualDisplayPairs: {},
    presetSlots: 5,
  },
];

/** Conservative catch-all: 6½ digit mid-range. */
export const TRUEVOLT_DEFAULT: TrueVoltProfile = {
  variant: "34xxxA",
  displayDigits: 6.5,
  modes: BASE_MODES,
  ranges: FULL_RANGES,
  nplcOptions: NPLC_65,
  dbmReferences: DBM_REF,
  transducers: TRANSDUCERS,
  dualDisplayPairs: DUAL_DISPLAY_FULL,
  presetSlots: 5,
};

/**
 * Truevolt refinement: `*OPT?` lists licensed capabilities. 4.7 only
 * *observes* the options and keeps the base profile — the digitize
 * / histogram / data-logger options widen the facade beyond the
 * 2.6a–c contract and are scheduled for a later step. The hook stays
 * live so that widening is a profile-only change.
 */
export async function refineTrueVoltProfile(
  base: TrueVoltProfile,
  port: ScpiPort,
): Promise<TrueVoltProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
