import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * GW Instek AFG / MFG series profile.
 *
 * AFG-2000 is the entry line (5–25 MHz, 2-ch, no modulation / sweep /
 * arbitrary on the smallest SKUs). AFG-3000 is dual-channel arbitrary
 * (sine/square/ramp/pulse/noise/dc/arb). MFG-2000 adds tracking +
 * optional RF on select SKUs — expose as a plain AFG here; RF / tracking
 * gates land in a future bump.
 */
export interface AfgProfile {
  readonly variant: string;
  readonly channelCount: 1 | 2;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly hasArbitrary: boolean;
  readonly arbitraryMaxSamples: number;
  readonly presetSlots: number;
}

export const AFG_VARIANTS: readonly AfgProfile[] = [
  // ---- AFG-2000 entry ----
  {
    variant: "AFG-2005",
    channelCount: 1,
    frequencyMaxHz: 5e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: false,
    arbitraryMaxSamples: 0,
    presetSlots: 0,
  },
  {
    variant: "AFG-2105",
    channelCount: 1,
    frequencyMaxHz: 5e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 16_384,
    presetSlots: 4,
  },
  {
    variant: "AFG-2125",
    channelCount: 1,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 16_384,
    presetSlots: 4,
  },
  // ---- AFG-3000 arbitrary ----
  {
    variant: "AFG-3021",
    channelCount: 1,
    frequencyMaxHz: 20e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 65_536,
    presetSlots: 10,
  },
  {
    variant: "AFG-3022",
    channelCount: 2,
    frequencyMaxHz: 20e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 65_536,
    presetSlots: 10,
  },
  {
    variant: "AFG-3081",
    channelCount: 1,
    frequencyMaxHz: 80e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 1_048_576,
    presetSlots: 10,
  },
  {
    variant: "AFG-3121",
    channelCount: 1,
    frequencyMaxHz: 120e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 1_048_576,
    presetSlots: 10,
  },
  // ---- MFG-2000 multi-function ----
  {
    variant: "MFG-2230M",
    channelCount: 2,
    frequencyMaxHz: 30e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 65_536,
    presetSlots: 10,
  },
  {
    variant: "MFG-2260M",
    channelCount: 2,
    frequencyMaxHz: 60e6,
    amplitudeMaxVpp: 10,
    hasArbitrary: true,
    arbitraryMaxSamples: 65_536,
    presetSlots: 10,
  },
];

/** Conservative catch-all: dual 20 MHz, arbitrary available, 10 slots. */
export const AFG_DEFAULT: AfgProfile = {
  variant: "AFGxxxx",
  channelCount: 2,
  frequencyMaxHz: 20e6,
  amplitudeMaxVpp: 10,
  hasArbitrary: true,
  arbitraryMaxSamples: 16_384,
  presetSlots: 4,
};

export async function refineAfgProfile(
  base: AfgProfile,
  port: ScpiPort,
): Promise<AfgProfile> {
  const opts = await queryOptList(port);
  void opts;
  return base;
}
