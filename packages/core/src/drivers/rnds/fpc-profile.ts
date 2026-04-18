import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * R&S spectrum-analyzer profile.
 *
 * Covers the handheld / benchtop SA catalogue driven from a shared
 * SCPI dialect:
 *   - **FPC1000 / FPC1500** — entry 1 / 3 GHz SAs.
 *   - **FPL1000 series** — mid-tier 3 / 7.5 / 14 GHz SAs.
 *   - **HMS1000 / HMS3000** — Hameg-heritage SAs (IDN reports HAMEG).
 *
 * Flagship **FSW / FSVA / ESR** are backlog: their SCPI surface is far
 * larger than the entry SA tree and a real hardware report is worth
 * waiting for before flipping those rows out of backlog.
 */
export interface FpcProfile {
  readonly variant: string;
  readonly family: "FPC" | "FPL" | "HMS";
  readonly frequencyMinHz: number;
  readonly frequencyMaxHz: number;
  readonly referenceLevelMinDbm: number;
  readonly referenceLevelMaxDbm: number;
  readonly attenuationRangeDb: { readonly min: number; readonly max: number };
  readonly preampFreqRangeHz: { readonly min: number; readonly max: number } | null;
  readonly hasTrackingGenerator: boolean;
  readonly maxSweepPoints: number;
  readonly traceCount: number;
  readonly markerCount: number;
  readonly limitLineCount: number;
  readonly presetSlots: number;
  /** HMS legacy firmware identifies as `HAMEG`. */
  readonly hamegLegacy: boolean;
}

const COMMON = {
  frequencyMinHz: 5e3,
  referenceLevelMaxDbm: 30,
  referenceLevelMinDbm: -130,
  attenuationRangeDb: { min: 0, max: 40 },
  maxSweepPoints: 1001,
  traceCount: 4,
  markerCount: 8,
  limitLineCount: 4,
  presetSlots: 10,
} as const;

export const FPC_VARIANTS: readonly FpcProfile[] = [
  {
    variant: "FPC1000",
    family: "FPC",
    ...COMMON,
    frequencyMaxHz: 1e9,
    preampFreqRangeHz: { min: 100e3, max: 1e9 },
    hasTrackingGenerator: false,
    hamegLegacy: false,
  },
  {
    variant: "FPC1500",
    family: "FPC",
    ...COMMON,
    frequencyMaxHz: 3e9,
    preampFreqRangeHz: { min: 100e3, max: 3e9 },
    hasTrackingGenerator: true,
    hamegLegacy: false,
  },
  {
    variant: "FPL1003",
    family: "FPL",
    ...COMMON,
    frequencyMaxHz: 3e9,
    preampFreqRangeHz: { min: 100e3, max: 3e9 },
    hasTrackingGenerator: false,
    hamegLegacy: false,
  },
  {
    variant: "FPL1007",
    family: "FPL",
    ...COMMON,
    frequencyMaxHz: 7.5e9,
    preampFreqRangeHz: { min: 100e3, max: 7.5e9 },
    hasTrackingGenerator: false,
    hamegLegacy: false,
  },
  {
    variant: "FPL1014",
    family: "FPL",
    ...COMMON,
    frequencyMaxHz: 14e9,
    preampFreqRangeHz: { min: 100e3, max: 14e9 },
    hasTrackingGenerator: false,
    hamegLegacy: false,
  },
  {
    variant: "HMS1000",
    family: "HMS",
    ...COMMON,
    frequencyMaxHz: 1e9,
    preampFreqRangeHz: { min: 100e3, max: 1e9 },
    hasTrackingGenerator: false,
    hamegLegacy: true,
  },
  {
    variant: "HMS3000",
    family: "HMS",
    ...COMMON,
    frequencyMaxHz: 3e9,
    preampFreqRangeHz: { min: 100e3, max: 3e9 },
    hasTrackingGenerator: false,
    hamegLegacy: true,
  },
];

export const FPC_DEFAULT: FpcProfile = {
  variant: "FPCxxxx",
  family: "FPC",
  ...COMMON,
  frequencyMaxHz: 1e9,
  preampFreqRangeHz: { min: 100e3, max: 1e9 },
  hasTrackingGenerator: false,
  hamegLegacy: false,
};

/**
 * `*OPT?` on FPC/FPL advertises tracking-generator (`B22`), preamp
 * (`B25`), and frequency-extension licences. Tokens are recorded so
 * downstream tooling can surface them, but we don't silently widen
 * the frequency ceiling.
 */
export async function refineFpcProfile(
  base: FpcProfile,
  port: ScpiPort,
): Promise<FpcProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;
  let hasTrackingGenerator = base.hasTrackingGenerator;
  for (const tok of options) {
    if (/^B22\b|TG\b/i.test(tok)) hasTrackingGenerator = true;
  }
  return { ...base, hasTrackingGenerator };
}
