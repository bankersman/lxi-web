import type { ScpiPort } from "../../scpi/port.js";
import type {
  MultimeterDualDisplayCapability,
  MultimeterMode,
  MultimeterRange,
  TemperatureTransducer,
} from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant-specific capability profile for the Siglent SDM DMM family.
 * The SCPI dialect is SCPI-3 standard across the range; what differs is
 * digit count (mode set), range ceilings, NPLC menu, and the dual-
 * display pairings the firmware honours.
 */
export interface SdmProfile {
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
  frequency: ["period", "acVoltage"],
  period: ["frequency"],
  resistance: ["continuity"],
  fourWireResistance: ["continuity"],
  temperature: ["resistance"],
};

// 4½-digit SDMs don't meaningfully support NPLC < 1; 5½ and 6½ digit
// models do. The profile lets the UI present only the legal options.
const NPLC_4_5: readonly number[] = [0.3, 1, 10];
const NPLC_5_5: readonly number[] = [0.3, 1, 10, 100];
const NPLC_6_5: readonly number[] = [0.02, 0.2, 1, 10, 100];

const DBM_REF: readonly number[] = [50, 75, 93, 110, 124, 135, 150, 250, 300, 500, 600, 800, 1000];

export const SDM_VARIANTS: readonly SdmProfile[] = [
  {
    variant: "SDM3045X",
    displayDigits: 4.5,
    modes: FULL_MODES.filter((m) => m !== "fourWireResistance"),
    ranges: { ...FULL_RANGES, fourWireResistance: undefined },
    nplcOptions: NPLC_4_5,
    dbmReferences: DBM_REF,
    transducers: FULL_TRANSDUCERS,
    dualDisplayPairs: FULL_DUAL_DISPLAY,
    presetSlots: 20,
  },
  {
    variant: "SDM3055",
    displayDigits: 5.5,
    modes: FULL_MODES,
    ranges: FULL_RANGES,
    nplcOptions: NPLC_5_5,
    dbmReferences: DBM_REF,
    transducers: FULL_TRANSDUCERS,
    dualDisplayPairs: FULL_DUAL_DISPLAY,
    presetSlots: 20,
  },
  {
    variant: "SDM3065X",
    displayDigits: 6.5,
    modes: FULL_MODES,
    ranges: FULL_RANGES,
    nplcOptions: NPLC_6_5,
    dbmReferences: DBM_REF,
    transducers: FULL_TRANSDUCERS,
    dualDisplayPairs: FULL_DUAL_DISPLAY,
    presetSlots: 20,
  },
  {
    // SDM3065X-SC adds the SC-1094 scanner card; the card itself is a
    // separate facade (multi-channel scan) tracked under backlog. For
    // core DMM behaviour the profile matches SDM3065X.
    variant: "SDM3065X-SC",
    displayDigits: 6.5,
    modes: FULL_MODES,
    ranges: FULL_RANGES,
    nplcOptions: NPLC_6_5,
    dbmReferences: DBM_REF,
    transducers: FULL_TRANSDUCERS,
    dualDisplayPairs: FULL_DUAL_DISPLAY,
    presetSlots: 20,
  },
];

/** Conservative catch-all: 5½-digit mid-range matches the most common Siglent SDM. */
export const SDM_DEFAULT: SdmProfile = {
  variant: "SDM3xxx",
  displayDigits: 5.5,
  modes: FULL_MODES,
  ranges: FULL_RANGES,
  nplcOptions: NPLC_5_5,
  dbmReferences: DBM_REF,
  transducers: FULL_TRANSDUCERS,
  dualDisplayPairs: FULL_DUAL_DISPLAY,
  presetSlots: 20,
};

/**
 * SDM refinement: `*OPT?` surfaces the scanner-card option on 3065X-SC
 * (token `SDM-SC`). If we observe it on a non-SC variant profile we
 * promote the profile to its SC sibling's behaviour — this matters
 * once the scan-list facade lands (backlog). For 4.6 the refiner is a
 * no-op so the profile contract is stable.
 */
export async function refineSdmProfile(
  base: SdmProfile,
  port: ScpiPort,
): Promise<SdmProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
