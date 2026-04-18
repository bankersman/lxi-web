import type { ScpiPort } from "../../scpi/port.js";
import { parseOptList, queryOptList } from "./_shared/index.js";

export interface Dl3000Profile {
  readonly variant: string;
  readonly voltageMax: number;
  readonly currentMax: number;
  readonly powerMax: number;
  readonly resistanceRange: { readonly min: number; readonly max: number };
  readonly presetSlots: number;
}

// DL3021 / DL3031 specs per the Rigol DL3000 programming guide. Resistance
// range is the widest-range setting; instrument clamps per-tier but we
// advertise the full ceiling so the UI range slider matches the front panel.
export const DL3000_VARIANTS: readonly Dl3000Profile[] = [
  {
    variant: "DL3021",
    voltageMax: 150,
    currentMax: 40,
    powerMax: 200,
    resistanceRange: { min: 0.05, max: 7500 },
    presetSlots: 10,
  },
  {
    variant: "DL3031",
    voltageMax: 150,
    currentMax: 60,
    powerMax: 350,
    resistanceRange: { min: 0.03, max: 7500 },
    presetSlots: 10,
  },
];

export const DL3000_DEFAULT: Dl3000Profile = {
  variant: "DL30xx",
  voltageMax: 150,
  currentMax: 40,
  powerMax: 200,
  resistanceRange: { min: 0.05, max: 7500 },
  presetSlots: 10,
};

/**
 * Runtime refinement. DL3000 `*OPT?` primarily reports enabled firmware
 * options (BATTery, LIST, OCP/OCPA etc). We don't use that to widen
 * capabilities today — every shipping unit exposes the entire SCPI tree —
 * but calling the probe here matches the pattern every other family
 * uses and sets us up for future license-gated features.
 */
export async function refineDl3000Profile(
  base: Dl3000Profile,
  port: ScpiPort,
): Promise<Dl3000Profile> {
  // The call is purely observational today; swallow any failure.
  try {
    const raw = await port.query("*OPT?", { timeoutMs: 1000 });
    parseOptList(raw);
  } catch {
    /* ignore */
  }
  // Future: flip a `hasListMode` flag when `LIST` appears in options.
  return base;
}

// Re-export for symmetry with the DP900 shim; lets callers pull helpers
// from the family's profile module instead of `_shared/`.
export { queryOptList };
