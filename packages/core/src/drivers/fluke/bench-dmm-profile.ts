import type { ScpiPort } from "../../scpi/port.js";
import type {
  MultimeterMathFunction,
  MultimeterMode,
  MultimeterRange,
} from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Fluke 8000 / 8800 series bench-DMM profile.
 *
 * Covers the narrow LXI-enabled Fluke catalogue:
 *   - **8808A** — 5½-digit bench DMM (LAN, reduced feature set).
 *   - **8845A / 8846A** — 6½-digit bench DMMs with dual display + math.
 *   - **8588A** — 8½-digit reference DMM (metrology focus).
 *   - **8508A** — 8½-digit reference DMM (GPIB + LAN bridge).
 *
 * Every variant speaks SCPI-99 (`CONFigure`, `SENSe:<fn>`, `READ?`).
 * `needsCrlf` is a hint for the session layer — Fluke firmware on the
 * 8508A and pre-2018 8588A expects **CR + LF** line terminators rather
 * than bare LF. The driver itself is terminator-agnostic; downstream
 * session configuration honours the flag.
 *
 * Not covered: ScopeMeter handhelds, 289 / 87V multimeters, process
 * tools, clamp meters — they use Fluke Connect / USB rather than LXI.
 */
export type BenchDmmFamily = "8800" | "8000" | "8500";

export interface BenchDmmProfile {
  readonly variant: string;
  readonly family: BenchDmmFamily;
  readonly digits: 5.5 | 6.5 | 8.5;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Readonly<
    Partial<Record<MultimeterMode, readonly MultimeterRange[]>>
  >;
  readonly nplcOptions: readonly number[];
  readonly mathFunctions: readonly MultimeterMathFunction[];
  readonly hasDualDisplay: boolean;
  readonly presetSlots: number;
  /** Older Fluke firmware insists on CR+LF termination; hint-only. */
  readonly needsCrlf: boolean;
}

const COMMON_RANGES: Readonly<
  Partial<Record<MultimeterMode, readonly MultimeterRange[]>>
> = {
  dcVoltage: [
    { label: "100 mV", upper: 0.1 },
    { label: "1 V", upper: 1 },
    { label: "10 V", upper: 10 },
    { label: "100 V", upper: 100 },
    { label: "1000 V", upper: 1000 },
  ],
  acVoltage: [
    { label: "100 mV", upper: 0.1 },
    { label: "1 V", upper: 1 },
    { label: "10 V", upper: 10 },
    { label: "100 V", upper: 100 },
    { label: "750 V", upper: 750 },
  ],
  dcCurrent: [
    { label: "10 mA", upper: 0.01 },
    { label: "100 mA", upper: 0.1 },
    { label: "1 A", upper: 1 },
    { label: "3 A", upper: 3 },
    { label: "10 A", upper: 10 },
  ],
  acCurrent: [
    { label: "10 mA", upper: 0.01 },
    { label: "100 mA", upper: 0.1 },
    { label: "1 A", upper: 1 },
    { label: "3 A", upper: 3 },
    { label: "10 A", upper: 10 },
  ],
  resistance: [
    { label: "100 Ω", upper: 100 },
    { label: "1 kΩ", upper: 1e3 },
    { label: "10 kΩ", upper: 1e4 },
    { label: "100 kΩ", upper: 1e5 },
    { label: "1 MΩ", upper: 1e6 },
    { label: "10 MΩ", upper: 1e7 },
    { label: "100 MΩ", upper: 1e8 },
  ],
};

const BASE_MATH: readonly MultimeterMathFunction[] = ["none", "null", "db", "dbm"];
const FULL_MATH: readonly MultimeterMathFunction[] = [
  "none",
  "null",
  "db",
  "dbm",
  "stats",
  "limit",
];

export const BENCH_DMM_VARIANTS: readonly BenchDmmProfile[] = [
  // ---- 8000 series (entry, reduced feature set) ----
  {
    variant: "8808A",
    family: "8000",
    digits: 5.5,
    modes: [
      "dcVoltage",
      "acVoltage",
      "dcCurrent",
      "acCurrent",
      "resistance",
      "frequency",
      "continuity",
      "diode",
    ],
    ranges: COMMON_RANGES,
    nplcOptions: [0.02, 0.2, 1, 10],
    mathFunctions: BASE_MATH,
    hasDualDisplay: false,
    presetSlots: 7,
    needsCrlf: true,
  },
  // ---- 8800 series (bench 6½-digit) ----
  {
    variant: "8845A",
    family: "8800",
    digits: 6.5,
    modes: [
      "dcVoltage",
      "acVoltage",
      "dcCurrent",
      "acCurrent",
      "resistance",
      "fourWireResistance",
      "frequency",
      "period",
      "continuity",
      "diode",
      "temperature",
    ],
    ranges: COMMON_RANGES,
    nplcOptions: [0.02, 0.2, 1, 10, 100],
    mathFunctions: FULL_MATH,
    hasDualDisplay: true,
    presetSlots: 5,
    needsCrlf: false,
  },
  {
    variant: "8846A",
    family: "8800",
    digits: 6.5,
    modes: [
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
    ],
    ranges: COMMON_RANGES,
    nplcOptions: [0.02, 0.2, 1, 10, 100],
    mathFunctions: FULL_MATH,
    hasDualDisplay: true,
    presetSlots: 5,
    needsCrlf: false,
  },
  // ---- 8500 series (metrology-grade reference DMMs) ----
  {
    variant: "8588A",
    family: "8500",
    digits: 8.5,
    modes: [
      "dcVoltage",
      "acVoltage",
      "dcCurrent",
      "acCurrent",
      "resistance",
      "fourWireResistance",
      "frequency",
    ],
    ranges: COMMON_RANGES,
    nplcOptions: [0.02, 0.2, 1, 10, 100, 200],
    mathFunctions: FULL_MATH,
    hasDualDisplay: false,
    presetSlots: 10,
    needsCrlf: true,
  },
  {
    variant: "8508A",
    family: "8500",
    digits: 8.5,
    modes: [
      "dcVoltage",
      "acVoltage",
      "dcCurrent",
      "acCurrent",
      "resistance",
      "fourWireResistance",
      "frequency",
    ],
    ranges: COMMON_RANGES,
    nplcOptions: [1, 10, 100, 200],
    mathFunctions: FULL_MATH,
    hasDualDisplay: false,
    presetSlots: 10,
    needsCrlf: true,
  },
];

export const BENCH_DMM_DEFAULT: BenchDmmProfile = {
  variant: "Fluke-bench",
  family: "8800",
  digits: 6.5,
  modes: [
    "dcVoltage",
    "acVoltage",
    "dcCurrent",
    "acCurrent",
    "resistance",
    "fourWireResistance",
    "frequency",
  ],
  ranges: COMMON_RANGES,
  nplcOptions: [0.02, 0.2, 1, 10, 100],
  mathFunctions: BASE_MATH,
  hasDualDisplay: false,
  presetSlots: 5,
  needsCrlf: false,
};

/**
 * `SYSTem:OPTion?` (preferred) or `*OPT?` enables dual-display / math
 * on variants that advertise the upgrade. Older 8808A firmware returns
 * the empty string; in that case we keep the base profile untouched.
 */
export async function refineBenchDmmProfile(
  base: BenchDmmProfile,
  port: ScpiPort,
): Promise<BenchDmmProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;
  let hasDualDisplay = base.hasDualDisplay;
  const math = new Set<MultimeterMathFunction>(base.mathFunctions);
  for (const tok of options) {
    const u = tok.toUpperCase();
    if (/DUAL|SECONDARY/.test(u)) hasDualDisplay = true;
    if (/MATH|STAT/.test(u)) {
      math.add("stats");
      math.add("limit");
    }
  }
  return {
    ...base,
    hasDualDisplay,
    mathFunctions: [...math],
  };
}
