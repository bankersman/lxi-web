import type { ScpiPort } from "../../scpi/port.js";
import type { MultimeterMode, MultimeterRange } from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * GW Instek GDM bench-DMM profile.
 *
 * GDM-8261A is 5½-digit; GDM-8341 / GDM-906x are 6½-digit. Dual
 * display / math / temperature transducers vary — gate them off
 * via profile fields rather than `*OPT?` (GDM firmware returns
 * inconsistent strings).
 */
export interface GdmProfile {
  readonly variant: string;
  readonly digits: 5.5 | 6.5;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Readonly<Partial<Record<MultimeterMode, readonly MultimeterRange[]>>>;
  readonly nplcOptions: readonly number[];
  readonly hasDualDisplay: boolean;
  readonly hasMath: boolean;
  readonly hasTemperature: boolean;
  readonly presetSlots: number;
}

const VOLT_RANGES: readonly MultimeterRange[] = [
  { label: "100 mV", upper: 0.1 },
  { label: "1 V", upper: 1 },
  { label: "10 V", upper: 10 },
  { label: "100 V", upper: 100 },
  { label: "1000 V", upper: 1000 },
];
const CURR_RANGES: readonly MultimeterRange[] = [
  { label: "10 mA", upper: 0.01 },
  { label: "100 mA", upper: 0.1 },
  { label: "1 A", upper: 1 },
  { label: "10 A", upper: 10 },
];
const RES_RANGES: readonly MultimeterRange[] = [
  { label: "100 Ω", upper: 100 },
  { label: "1 kΩ", upper: 1e3 },
  { label: "10 kΩ", upper: 1e4 },
  { label: "100 kΩ", upper: 1e5 },
  { label: "1 MΩ", upper: 1e6 },
  { label: "10 MΩ", upper: 1e7 },
];

export const GDM_VARIANTS: readonly GdmProfile[] = [
  {
    variant: "GDM-8261A",
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
    ranges: {
      dcVoltage: VOLT_RANGES,
      acVoltage: VOLT_RANGES,
      dcCurrent: CURR_RANGES,
      acCurrent: CURR_RANGES,
      resistance: RES_RANGES,
    },
    nplcOptions: [0.02, 0.2, 1, 10],
    hasDualDisplay: false,
    hasMath: false,
    hasTemperature: false,
    presetSlots: 5,
  },
  {
    variant: "GDM-8341",
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
    ],
    ranges: {
      dcVoltage: VOLT_RANGES,
      acVoltage: VOLT_RANGES,
      dcCurrent: CURR_RANGES,
      acCurrent: CURR_RANGES,
      resistance: RES_RANGES,
      fourWireResistance: RES_RANGES,
    },
    nplcOptions: [0.02, 0.2, 1, 10, 100],
    hasDualDisplay: true,
    hasMath: true,
    hasTemperature: false,
    presetSlots: 5,
  },
  {
    variant: "GDM-9061",
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
    ranges: {
      dcVoltage: VOLT_RANGES,
      acVoltage: VOLT_RANGES,
      dcCurrent: CURR_RANGES,
      acCurrent: CURR_RANGES,
      resistance: RES_RANGES,
      fourWireResistance: RES_RANGES,
    },
    nplcOptions: [0.02, 0.2, 1, 10, 100],
    hasDualDisplay: true,
    hasMath: true,
    hasTemperature: true,
    presetSlots: 10,
  },
  {
    variant: "GDM-9062",
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
    ranges: {
      dcVoltage: VOLT_RANGES,
      acVoltage: VOLT_RANGES,
      dcCurrent: CURR_RANGES,
      acCurrent: CURR_RANGES,
      resistance: RES_RANGES,
      fourWireResistance: RES_RANGES,
    },
    nplcOptions: [0.02, 0.2, 1, 10, 100],
    hasDualDisplay: true,
    hasMath: true,
    hasTemperature: true,
    presetSlots: 10,
  },
];

export const GDM_DEFAULT: GdmProfile = GDM_VARIANTS[0]!;

export async function refineGdmProfile(
  base: GdmProfile,
  port: ScpiPort,
): Promise<GdmProfile> {
  const opts = await queryOptList(port);
  void opts;
  return base;
}
