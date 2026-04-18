import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * GW Instek GSP spectrum-analyzer profile.
 *
 * GSP-730 is the entry 3 GHz SA with a narrower feature surface;
 * GSP-9300 / 9330 are the mid-tier 3/3.25 GHz SAs that accept a
 * tracking-generator option. Tracking-generator is gated by `*OPT?`
 * presence — not baked into the variant table since the same model
 * can ship with or without it.
 */
export interface GspProfile {
  readonly variant: string;
  readonly frequencyMinHz: number;
  readonly frequencyMaxHz: number;
  readonly referenceLevelMinDbm: number;
  readonly referenceLevelMaxDbm: number;
  readonly attenuationRangeDb: { readonly min: number; readonly max: number };
  readonly preampFreqRangeHz?: { readonly min: number; readonly max: number };
  readonly traceCount: number;
  readonly markerCount: number;
  readonly hasTrackingGenerator: boolean;
  readonly presetSlots: number;
}

export const GSP_VARIANTS: readonly GspProfile[] = [
  {
    variant: "GSP-730",
    frequencyMinHz: 150e3,
    frequencyMaxHz: 3e9,
    referenceLevelMinDbm: -100,
    referenceLevelMaxDbm: 20,
    attenuationRangeDb: { min: 0, max: 50 },
    traceCount: 3,
    markerCount: 5,
    hasTrackingGenerator: false,
    presetSlots: 5,
  },
  {
    variant: "GSP-9300",
    frequencyMinHz: 9e3,
    frequencyMaxHz: 3e9,
    referenceLevelMinDbm: -100,
    referenceLevelMaxDbm: 30,
    attenuationRangeDb: { min: 0, max: 50 },
    preampFreqRangeHz: { min: 1e6, max: 3e9 },
    traceCount: 4,
    markerCount: 6,
    hasTrackingGenerator: false,
    presetSlots: 10,
  },
  {
    variant: "GSP-9330",
    frequencyMinHz: 9e3,
    frequencyMaxHz: 3.25e9,
    referenceLevelMinDbm: -100,
    referenceLevelMaxDbm: 30,
    attenuationRangeDb: { min: 0, max: 50 },
    preampFreqRangeHz: { min: 1e6, max: 3.25e9 },
    traceCount: 4,
    markerCount: 6,
    hasTrackingGenerator: false,
    presetSlots: 10,
  },
];

/** Conservative catch-all: GSP-9300-class envelope with no TG. */
export const GSP_DEFAULT: GspProfile = {
  variant: "GSPxxxx",
  frequencyMinHz: 9e3,
  frequencyMaxHz: 3e9,
  referenceLevelMinDbm: -100,
  referenceLevelMaxDbm: 20,
  attenuationRangeDb: { min: 0, max: 50 },
  traceCount: 3,
  markerCount: 6,
  hasTrackingGenerator: false,
  presetSlots: 5,
};

/**
 * Probe `*OPT?` for the tracking-generator option. GSP option strings
 * vary (`TG`, `OPT-TG`, `B15`-style), so we test with a broad regex.
 */
export async function refineGspProfile(
  base: GspProfile,
  port: ScpiPort,
): Promise<GspProfile> {
  const opts = await queryOptList(port);
  const hasTg = opts.some((o) => /\b(tg|tracking)\b/i.test(o));
  if (!hasTg) return base;
  return { ...base, hasTrackingGenerator: true };
}
