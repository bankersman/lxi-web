import type { ScpiPort } from "../../scpi/port.js";
import type {
  MultimeterDualDisplayCapability,
  MultimeterMode,
  MultimeterRange,
  TemperatureTransducer,
} from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant-specific capability profile for the Rigol DM800 DMM family. The
 * DM858 and DM858E share the same command tree; the E-variant adds a few
 * function licences we express via `modes` and `transducers`.
 */
export interface Dm800Profile {
  readonly variant: string;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Partial<Record<MultimeterMode, readonly MultimeterRange[]>>;
  readonly nplcOptions: readonly number[];
  readonly dbmReferences: readonly number[];
  readonly transducers: readonly TemperatureTransducer[];
  readonly dualDisplayPairs: MultimeterDualDisplayCapability["pairs"];
  readonly presetSlots: number;
}

// Full mode list available on the flagship DM858/DM858E. A catch-all profile
// uses this set; leaner SKUs in the future can prune it.
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

const FULL_DUAL_DISPLAY: MultimeterDualDisplayCapability["pairs"] = {
  dcVoltage: ["acVoltage", "frequency"],
  acVoltage: ["dcVoltage", "frequency"],
  dcCurrent: ["acCurrent", "frequency"],
  acCurrent: ["dcCurrent", "frequency"],
  resistance: ["continuity"],
  fourWireResistance: ["continuity"],
  frequency: ["period", "acVoltage"],
  period: ["frequency"],
  temperature: ["resistance"],
};

const STANDARD_NPLC: readonly number[] = [0.02, 0.2, 1, 10, 100];
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
    // DM858E drops the fourWireResistance option until the premium license
    // is installed; the refiner re-adds it when *OPT? reports DM-4W.
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
 * Runtime refinement: `*OPT?` can tell us whether the DM858E has the
 * 4-wire-resistance license installed. Any token that matches `DM-4W`
 * re-enables the fourWireResistance mode on the active profile.
 */
export async function refineDm800Profile(
  base: Dm800Profile,
  port: ScpiPort,
): Promise<Dm800Profile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;
  const has4W = options.some((o) => /DM-4W/i.test(o));
  if (!has4W) return base;
  if (base.modes.includes("fourWireResistance")) return base;
  return {
    ...base,
    modes: [...base.modes, "fourWireResistance"],
    ranges: { ...base.ranges, fourWireResistance: FULL_RANGES.fourWireResistance },
  };
}
