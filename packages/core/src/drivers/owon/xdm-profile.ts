import type { ScpiPort } from "../../scpi/port.js";
import type {
  MultimeterMode,
  MultimeterRange,
} from "../../facades/multimeter.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Owon XDM DMM family profile.
 *
 * Owon XDMs expose the common SCPI-1999 `CONFigure` + `READ?` pattern
 * but with significantly fewer modes than Keysight Truevolt or Siglent
 * SDM. Notable gaps:
 *   - No 4-wire resistance on XDM1041 / XDM1241 (only the 5½-digit
 *     XDM2041 adds it).
 *   - No temperature mode across the LXI-advertised SKUs.
 *   - `logging`, `math`, and `dualDisplay` capabilities are **not**
 *     surfaced — the firmware implements a minimal subset of these on
 *     the front panel only, without SCPI equivalents. Advertising
 *     them would leave the user staring at a non-functional UI tab.
 *
 * The profile is the minimal shape the driver needs: mode set, per-mode
 * ranges, and a conservative NPLC menu. Presets are pass-through via
 * `*SAV` / `*RCL` on the 5½-digit XDM2041 and absent on the 4½-digit
 * siblings.
 */
export interface XdmProfile {
  readonly variant: string;
  readonly displayDigits: number;
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Partial<Record<MultimeterMode, readonly MultimeterRange[]>>;
  readonly nplcOptions: readonly number[];
  readonly presetSlots: number;
}

const COMMON_DC_VOLT: readonly MultimeterRange[] = [
  { label: "200 mV", upper: 0.2 },
  { label: "2 V", upper: 2 },
  { label: "20 V", upper: 20 },
  { label: "200 V", upper: 200 },
  { label: "1000 V", upper: 1000 },
];

const COMMON_AC_VOLT: readonly MultimeterRange[] = [
  { label: "200 mV", upper: 0.2 },
  { label: "2 V", upper: 2 },
  { label: "20 V", upper: 20 },
  { label: "200 V", upper: 200 },
  { label: "750 V", upper: 750 },
];

const COMMON_DC_CURR: readonly MultimeterRange[] = [
  { label: "2 mA", upper: 0.002 },
  { label: "20 mA", upper: 0.02 },
  { label: "200 mA", upper: 0.2 },
  { label: "2 A", upper: 2 },
  { label: "10 A", upper: 10 },
];

const COMMON_RES: readonly MultimeterRange[] = [
  { label: "200 Ω", upper: 200 },
  { label: "2 kΩ", upper: 2_000 },
  { label: "20 kΩ", upper: 20_000 },
  { label: "200 kΩ", upper: 200_000 },
  { label: "2 MΩ", upper: 2_000_000 },
  { label: "20 MΩ", upper: 20_000_000 },
];

const COMMON_CAP: readonly MultimeterRange[] = [
  { label: "2 nF", upper: 2e-9 },
  { label: "20 nF", upper: 20e-9 },
  { label: "200 nF", upper: 200e-9 },
  { label: "2 µF", upper: 2e-6 },
  { label: "20 µF", upper: 20e-6 },
  { label: "200 µF", upper: 200e-6 },
];

const BASE_MODES: readonly MultimeterMode[] = [
  "dcVoltage",
  "acVoltage",
  "dcCurrent",
  "acCurrent",
  "resistance",
  "frequency",
  "period",
  "capacitance",
  "continuity",
  "diode",
];

const BASE_RANGES: Partial<Record<MultimeterMode, readonly MultimeterRange[]>> = {
  dcVoltage: COMMON_DC_VOLT,
  acVoltage: COMMON_AC_VOLT,
  dcCurrent: COMMON_DC_CURR,
  acCurrent: COMMON_DC_CURR,
  resistance: COMMON_RES,
  capacitance: COMMON_CAP,
};

const NPLC_4_5: readonly number[] = [1, 10];
const NPLC_5_5: readonly number[] = [0.3, 1, 10];

export const XDM_VARIANTS: readonly XdmProfile[] = [
  {
    variant: "XDM1041",
    displayDigits: 4.5,
    modes: BASE_MODES,
    ranges: BASE_RANGES,
    nplcOptions: NPLC_4_5,
    presetSlots: 0,
  },
  {
    variant: "XDM1241",
    displayDigits: 4.5,
    modes: BASE_MODES,
    ranges: BASE_RANGES,
    nplcOptions: NPLC_4_5,
    presetSlots: 0,
  },
  {
    variant: "XDM2041",
    displayDigits: 5.5,
    modes: [...BASE_MODES, "fourWireResistance"],
    ranges: { ...BASE_RANGES, fourWireResistance: COMMON_RES },
    nplcOptions: NPLC_5_5,
    presetSlots: 5,
  },
];

/**
 * Conservative catch-all: matches the 4½-digit baseline so unknown
 * XDM variants degrade to the narrower mode set. An over-capable
 * profile would silently advertise 4-wire / NPLC menus the firmware
 * doesn't honour.
 */
export const XDM_DEFAULT: XdmProfile = {
  variant: "XDMxxxx",
  displayDigits: 4.5,
  modes: BASE_MODES,
  ranges: BASE_RANGES,
  nplcOptions: NPLC_4_5,
  presetSlots: 0,
};

/**
 * XDM refinement: some firmwares answer `*OPT?` with a comma-separated
 * license list; most don't respond at all. The helper swallows
 * failure paths and returns the base profile. Token-driven capability
 * promotion is a later-epic concern — Owon firmware metadata is too
 * inconsistent for now.
 */
export async function refineXdmProfile(
  base: XdmProfile,
  port: ScpiPort,
): Promise<XdmProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
