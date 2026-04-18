import type { ScpiPort } from "../../scpi/port.js";
import { parseOptList } from "../rigol/_shared/opt.js";

/**
 * Profile for Siglent SSA3000X / SSA3000X-R variants. The SCPI dialect is
 * shared across the family; the profile carries the knobs that differ from
 * model to model: maximum frequency, reference-level ceiling, tracking
 * generator availability, preamp frequency window.
 */
export interface Ssa3000xProfile {
  readonly variant: string;
  /** Upper frequency limit in Hz. */
  readonly frequencyMaxHz: number;
  /** Lower frequency limit in Hz. */
  readonly frequencyMinHz: number;
  /** Maximum safe input reference level in dBm. */
  readonly referenceLevelMaxDbm: number;
  /** Minimum reference level in dBm. */
  readonly referenceLevelMinDbm: number;
  /** Input attenuation range in dB. */
  readonly attenuationRangeDb: { readonly min: number; readonly max: number };
  /** Preamp frequency window (Hz), `null` when the SKU has no preamp. */
  readonly preampFreqRangeHz: { readonly min: number; readonly max: number } | null;
  /** Tracking generator fitted (R suffix). */
  readonly hasTrackingGenerator: boolean;
  /** Maximum sweep points returned by `TRAC?`. */
  readonly maxSweepPoints: number;
  /** Number of trace memories. */
  readonly traceCount: number;
  /** Number of marker slots. */
  readonly markerCount: number;
  /** Number of limit-line memories. */
  readonly limitLineCount: number;
  /** Preset (save/recall) slots. */
  readonly presetSlots: number;
}

const COMMON: Omit<Ssa3000xProfile, "variant" | "frequencyMaxHz" | "hasTrackingGenerator" | "preampFreqRangeHz"> = {
  frequencyMinHz: 9e3,
  referenceLevelMaxDbm: 30,
  referenceLevelMinDbm: -100,
  attenuationRangeDb: { min: 0, max: 51 },
  maxSweepPoints: 751,
  traceCount: 4,
  markerCount: 8,
  limitLineCount: 2,
  presetSlots: 10,
};

const PREAMP_WIDE = { min: 100e3, max: 1.5e9 } as const;

export const SSA3000X_VARIANTS: readonly Ssa3000xProfile[] = [
  {
    variant: "SSA3015X-R",
    ...COMMON,
    frequencyMaxHz: 1.5e9,
    hasTrackingGenerator: true,
    preampFreqRangeHz: { min: 100e3, max: 1.5e9 },
  },
  {
    variant: "SSA3015X",
    ...COMMON,
    frequencyMaxHz: 1.5e9,
    hasTrackingGenerator: false,
    preampFreqRangeHz: { min: 100e3, max: 1.5e9 },
  },
  {
    variant: "SSA3021X-R",
    ...COMMON,
    frequencyMaxHz: 2.1e9,
    hasTrackingGenerator: true,
    preampFreqRangeHz: { min: 100e3, max: 2.1e9 },
  },
  {
    variant: "SSA3021X",
    ...COMMON,
    frequencyMaxHz: 2.1e9,
    hasTrackingGenerator: false,
    preampFreqRangeHz: { min: 100e3, max: 2.1e9 },
  },
  {
    variant: "SSA3032X-R",
    ...COMMON,
    frequencyMaxHz: 3.2e9,
    hasTrackingGenerator: true,
    preampFreqRangeHz: { min: 100e3, max: 3.2e9 },
  },
  {
    variant: "SSA3032X",
    ...COMMON,
    frequencyMaxHz: 3.2e9,
    hasTrackingGenerator: false,
    preampFreqRangeHz: { min: 100e3, max: 3.2e9 },
  },
  {
    variant: "SSA3050X-R",
    ...COMMON,
    frequencyMaxHz: 5.0e9,
    hasTrackingGenerator: true,
    preampFreqRangeHz: { min: 100e3, max: 5.0e9 },
  },
  {
    variant: "SSA3050X",
    ...COMMON,
    frequencyMaxHz: 5.0e9,
    hasTrackingGenerator: false,
    preampFreqRangeHz: { min: 100e3, max: 5.0e9 },
  },
];

/**
 * Conservative fall-through for any `SSA3\d{3}X` IDN that doesn't match a
 * variant entry. Picks the middle-of-the-road 3.2 GHz model profile so the
 * limits are safe for most SKUs; the refiner may replace this with a more
 * accurate profile later.
 */
export const SSA3000X_DEFAULT: Ssa3000xProfile = {
  variant: "SSA3xxxX",
  ...COMMON,
  frequencyMaxHz: 3.2e9,
  hasTrackingGenerator: false,
  preampFreqRangeHz: PREAMP_WIDE,
};

/**
 * `*OPT?` stub for future license-gated features (tracking generator,
 * channel-power suite, EMI pre-compliance). The Siglent firmware reports
 * license tokens like `TG`, `AMK`, `EMI`, `REF` — today we parse but
 * don't react. Kept for parity with sibling Rigol refiners.
 */
export async function refineSsa3000xProfile(
  base: Ssa3000xProfile,
  port: ScpiPort,
): Promise<Ssa3000xProfile> {
  try {
    const raw = await port.query("*OPT?", { timeoutMs: 1000 });
    parseOptList(raw);
  } catch {
    /* ignore - license reporting is nice-to-have */
  }
  return base;
}
