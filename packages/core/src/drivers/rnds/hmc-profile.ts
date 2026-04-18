import type { ScpiPort } from "../../scpi/port.js";
import type { MultimeterMode, MultimeterRange } from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Rohde & Schwarz / Hameg bench-DMM profile.
 *
 * Covers the HMC8012 (5¾-digit bench DMM with arbitrary math + dual
 * display) and the DMM half of the HMC8015 power-analyzer. The HMC
 * family follows IVI-4.8 almost to the letter — `CONFigure:*`,
 * `SENSe:FUNCtion`, `SENSe:<func>:RANGe`, `SENSe:<func>:NPLC`,
 * `CALCulate:FUNCtion NULL|DB|DBM|AVERage|LIMit` — so we reuse the
 * same shape as the Keysight Truevolt profile.
 *
 * HMC8015 power-analyzer features (harmonic analysis, waveform
 * logging, integrator) are backlog — this pack covers the DMM half
 * only.
 */
export interface HmcProfile {
  readonly variant: string;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Readonly<Partial<Record<MultimeterMode, readonly MultimeterRange[]>>>;
  readonly nplcOptions: readonly number[];
  readonly presetSlots: number;
  readonly hamegLegacy: boolean;
}

const VOLTAGE_DC_RANGES: readonly MultimeterRange[] = [
  { label: "100 mV", upper: 0.1 },
  { label: "1 V", upper: 1 },
  { label: "10 V", upper: 10 },
  { label: "100 V", upper: 100 },
  { label: "1000 V", upper: 1000 },
];
const CURRENT_DC_RANGES: readonly MultimeterRange[] = [
  { label: "10 mA", upper: 0.01 },
  { label: "100 mA", upper: 0.1 },
  { label: "1 A", upper: 1 },
  { label: "10 A", upper: 10 },
];
const RESISTANCE_RANGES: readonly MultimeterRange[] = [
  { label: "100 Ω", upper: 100 },
  { label: "1 kΩ", upper: 1e3 },
  { label: "10 kΩ", upper: 1e4 },
  { label: "100 kΩ", upper: 1e5 },
  { label: "1 MΩ", upper: 1e6 },
  { label: "10 MΩ", upper: 1e7 },
];

export const HMC_VARIANTS: readonly HmcProfile[] = [
  {
    variant: "HMC8012",
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
      dcVoltage: VOLTAGE_DC_RANGES,
      acVoltage: VOLTAGE_DC_RANGES,
      dcCurrent: CURRENT_DC_RANGES,
      acCurrent: CURRENT_DC_RANGES,
      resistance: RESISTANCE_RANGES,
      fourWireResistance: RESISTANCE_RANGES,
    },
    nplcOptions: [0.02, 0.2, 1, 10, 100],
    presetSlots: 10,
    hamegLegacy: true,
  },
  {
    variant: "HMC8015",
    modes: ["dcVoltage", "acVoltage", "dcCurrent", "acCurrent", "frequency"],
    ranges: {
      dcVoltage: VOLTAGE_DC_RANGES,
      acVoltage: VOLTAGE_DC_RANGES,
      dcCurrent: CURRENT_DC_RANGES,
      acCurrent: CURRENT_DC_RANGES,
    },
    nplcOptions: [0.02, 0.2, 1, 10],
    presetSlots: 10,
    hamegLegacy: true,
  },
];

export const HMC_DEFAULT: HmcProfile = HMC_VARIANTS[0]!;

/** HMC `*OPT?` rarely affects the DMM surface; hook returns the base. */
export async function refineHmcProfile(
  base: HmcProfile,
  port: ScpiPort,
): Promise<HmcProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
