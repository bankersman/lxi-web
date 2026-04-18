import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant profile for the Keysight Trueform 33500B and 33600A ranges.
 *
 * Differences the profile carries:
 *   - channelCount (1 or 2)
 *   - frequency ceiling (sine bandwidth)
 *   - arbitrary memory ceiling (affects uploadArbitrary sizing —
 *     not exposed yet in the 4.4 facade; profile carries it for 4.9)
 */
export interface Trueform33500Profile {
  readonly variant: string;
  readonly channelCount: 1 | 2;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly arbitraryMaxSamples: number;
  readonly sampleRateMaxHz: number;
  readonly presetSlots: number;
}

// ---- 33500B ----
export const T33500B_VARIANTS: readonly Trueform33500Profile[] = [
  {
    variant: "33509B",
    channelCount: 1,
    frequencyMaxHz: 20e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 64_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "33510B",
    channelCount: 2,
    frequencyMaxHz: 20e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 64_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "33511B",
    channelCount: 1,
    frequencyMaxHz: 20e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 1_000_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "33512B",
    channelCount: 2,
    frequencyMaxHz: 20e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 1_000_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "33521B",
    channelCount: 1,
    frequencyMaxHz: 30e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 1_000_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "33522B",
    channelCount: 2,
    frequencyMaxHz: 30e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 1_000_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  // ---- 33600A ----
  {
    variant: "33611A",
    channelCount: 1,
    frequencyMaxHz: 80e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 4_000_000,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "33612A",
    channelCount: 2,
    frequencyMaxHz: 80e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 4_000_000,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "33621A",
    channelCount: 1,
    frequencyMaxHz: 120e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 4_000_000,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "33622A",
    channelCount: 2,
    frequencyMaxHz: 120e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 4_000_000,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
];

export const T33500_DEFAULT: Trueform33500Profile = {
  variant: "33xxxx",
  channelCount: 2,
  frequencyMaxHz: 20e6,
  amplitudeMaxVpp: 10,
  arbitraryMaxSamples: 64_000,
  sampleRateMaxHz: 250e6,
  presetSlots: 4,
};

/**
 * Trueform refinement. `*OPT?` surfaces arbitrary memory upgrade
 * (`MEM`) and sequence mode (`SEQ`). For 4.7 the hook is observational
 * only — widening arbitrary memory capability requires hardware-
 * verified upload-size limits.
 */
export async function refineTrueform33500Profile(
  base: Trueform33500Profile,
  port: ScpiPort,
): Promise<Trueform33500Profile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
