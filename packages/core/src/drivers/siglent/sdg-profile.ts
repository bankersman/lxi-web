import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

export interface SdgProfile {
  readonly variant: string;
  readonly channelCount: 1 | 2;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly sampleRateMaxHz: number;
  readonly arbitraryMaxSamples: number;
  readonly presetSlots: number;
}

/**
 * Siglent SDG variants confirmed via datasheet. Sine-wave bandwidth is
 * the headline spec; other waveform types clamp lower but we keep a
 * single `frequencyMaxHz` for the profile — driver validation uses it
 * as an upper bound and the SDG itself clamps for ramps / squares.
 */
export const SDG_VARIANTS: readonly SdgProfile[] = [
  {
    variant: "SDG1032X",
    channelCount: 2,
    frequencyMaxHz: 30e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 150e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 20,
  },
  {
    variant: "SDG1062X",
    channelCount: 2,
    frequencyMaxHz: 60e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 300e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 20,
  },
  {
    variant: "SDG2042X",
    channelCount: 2,
    frequencyMaxHz: 40e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 1.2e9,
    arbitraryMaxSamples: 8e6,
    presetSlots: 20,
  },
  {
    variant: "SDG2082X",
    channelCount: 2,
    frequencyMaxHz: 80e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 1.2e9,
    arbitraryMaxSamples: 8e6,
    presetSlots: 20,
  },
  {
    variant: "SDG2122X",
    channelCount: 2,
    frequencyMaxHz: 120e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 1.2e9,
    arbitraryMaxSamples: 8e6,
    presetSlots: 20,
  },
  {
    variant: "SDG6022X",
    channelCount: 2,
    frequencyMaxHz: 200e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 2.4e9,
    arbitraryMaxSamples: 2e7,
    presetSlots: 20,
  },
  {
    variant: "SDG6052X",
    channelCount: 2,
    frequencyMaxHz: 500e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 2.4e9,
    arbitraryMaxSamples: 2e7,
    presetSlots: 20,
  },
];

export const SDG_DEFAULT: SdgProfile = {
  variant: "SDGxxxx",
  channelCount: 2,
  frequencyMaxHz: 30e6,
  amplitudeMaxVpp: 20,
  sampleRateMaxHz: 150e6,
  arbitraryMaxSamples: 16_384,
  presetSlots: 20,
};

export async function refineSdgProfile(
  base: SdgProfile,
  port: ScpiPort,
): Promise<SdgProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
