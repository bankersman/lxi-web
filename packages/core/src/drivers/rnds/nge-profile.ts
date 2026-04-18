import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Rohde & Schwarz power-supply profile.
 *
 * Covers the full NGx bench-PSU catalogue under a single SCPI dialect:
 *   - **NGE100 / NGE103B** — triple-output 32 V / 3 A bench PSUs.
 *   - **NGL200 series** — 2-quadrant linear lab PSUs with mA digitising.
 *   - **NGM200 series** — battery-profile lab PSUs with fast transient.
 *   - **NGP800 series** — high-power multi-output modular PSUs.
 *   - **NGU200 / NGU400** — source-measure-oriented two-quadrant units
 *     (borders on SMU; exposed via `IPowerSupply` for now — SMU façade
 *     is backlog).
 *
 * Wire-level shape (R&S NGx programmer manual, rev. 2025-09):
 *   - `INSTrument:SELect OUT<n>` selects the active rail on multi-
 *     output chassis; single-output chassis accept the hop as a no-op.
 *   - `SOURce:VOLTage <v>` / `SOURce:CURRent <a>` drive the setpoints.
 *   - `OUTPut:STATe ON|OFF` toggles the per-channel relay; a separate
 *     `OUTPut:GENeral ON|OFF` gates the chassis master output but we
 *     don't surface it on the facade (users expect per-channel only).
 *   - `MEASure:SCALar:VOLTage?` / `:CURRent?` return scalars.
 *   - `SOURce:VOLTage:PROTection:LEVel <v>` + `:STATe ON|OFF` for OVP.
 *   - `*SAV <n>` / `*RCL <n>` — 10 slot preset memory on every model.
 *
 * NGU SMU-adjacent pairs surface `hasSmu = true`; downstream tooling
 * can upsell the SMU façade later.
 */
export interface NgeChannelSpec {
  readonly id: number;
  readonly label: string;
  readonly voltageMax: number;
  readonly currentMax: number;
}

export type NgeFamily =
  | "NGE"
  | "NGL"
  | "NGM"
  | "NGP"
  | "NGU"
  | "HMP"
  | "HMC";

export interface NgeProfile {
  readonly variant: string;
  readonly family: NgeFamily;
  readonly channels: readonly NgeChannelSpec[];
  readonly hasSmu: boolean;
  readonly presetSlots: number;
  /** Hameg-heritage HMP/HMC PSUs report `HAMEG` on *IDN?. */
  readonly hamegLegacy: boolean;
}

export const NGE_VARIANTS: readonly NgeProfile[] = [
  // ---- NGE100 / NGE103B — triple-output entry ----
  {
    variant: "NGE102B",
    family: "NGE",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "OUT2", voltageMax: 32, currentMax: 3 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  {
    variant: "NGE103B",
    family: "NGE",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "OUT2", voltageMax: 32, currentMax: 3 },
      { id: 3, label: "OUT3", voltageMax: 32, currentMax: 3 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  // ---- NGL200 series ----
  {
    variant: "NGL201",
    family: "NGL",
    channels: [{ id: 1, label: "OUT1", voltageMax: 20, currentMax: 6 }],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  {
    variant: "NGL202",
    family: "NGL",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 20, currentMax: 6 },
      { id: 2, label: "OUT2", voltageMax: 20, currentMax: 6 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  // ---- NGM200 series (battery-profile) ----
  {
    variant: "NGM201",
    family: "NGM",
    channels: [{ id: 1, label: "OUT1", voltageMax: 20, currentMax: 6 }],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  {
    variant: "NGM202",
    family: "NGM",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 20, currentMax: 6 },
      { id: 2, label: "OUT2", voltageMax: 20, currentMax: 6 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  // ---- NGP800 series ----
  {
    variant: "NGP804",
    family: "NGP",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 32, currentMax: 20 },
      { id: 2, label: "OUT2", voltageMax: 32, currentMax: 20 },
      { id: 3, label: "OUT3", voltageMax: 32, currentMax: 20 },
      { id: 4, label: "OUT4", voltageMax: 32, currentMax: 20 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  {
    variant: "NGP814",
    family: "NGP",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 64, currentMax: 10 },
      { id: 2, label: "OUT2", voltageMax: 64, currentMax: 10 },
      { id: 3, label: "OUT3", voltageMax: 32, currentMax: 20 },
      { id: 4, label: "OUT4", voltageMax: 32, currentMax: 20 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: false,
  },
  // ---- NGU SMU-adjacent ----
  {
    variant: "NGU201",
    family: "NGU",
    channels: [{ id: 1, label: "OUT1", voltageMax: 20, currentMax: 8 }],
    hasSmu: true,
    presetSlots: 10,
    hamegLegacy: false,
  },
  {
    variant: "NGU401",
    family: "NGU",
    channels: [{ id: 1, label: "OUT1", voltageMax: 20, currentMax: 8 }],
    hasSmu: true,
    presetSlots: 10,
    hamegLegacy: false,
  },
  // ---- Hameg-heritage HMP / HMC ----
  {
    variant: "HMP2030",
    family: "HMP",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 32, currentMax: 5 },
      { id: 2, label: "OUT2", voltageMax: 32, currentMax: 5 },
      { id: 3, label: "OUT3", voltageMax: 32, currentMax: 5 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: true,
  },
  {
    variant: "HMC8043",
    family: "HMC",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "OUT2", voltageMax: 32, currentMax: 3 },
      { id: 3, label: "OUT3", voltageMax: 32, currentMax: 3 },
    ],
    hasSmu: false,
    presetSlots: 10,
    hamegLegacy: true,
  },
];

/** Catch-all: triple-output 32 V / 3 A. Safer default than single-rail. */
export const NGE_DEFAULT: NgeProfile = {
  variant: "NGxxxx",
  family: "NGE",
  channels: [
    { id: 1, label: "OUT1", voltageMax: 32, currentMax: 3 },
    { id: 2, label: "OUT2", voltageMax: 32, currentMax: 3 },
    { id: 3, label: "OUT3", voltageMax: 32, currentMax: 3 },
  ],
  hasSmu: false,
  presetSlots: 10,
  hamegLegacy: false,
};

/**
 * NGx refinement. `*OPT?` rarely advertises capability upgrades —
 * firmware typically returns an empty string. The hook exists for
 * parity with the other R&S families and returns the base profile.
 */
export async function refineNgeProfile(
  base: NgeProfile,
  port: ScpiPort,
): Promise<NgeProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
