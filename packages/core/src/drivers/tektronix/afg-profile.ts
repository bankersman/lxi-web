import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Tektronix AFG series profile (AFG1000 / AFG3000C / AFG31000).
 *
 * SCPI shape matches the SCPI-1999 signal-generator tree:
 *   - `SOURce<n>:FUNCtion SIN|SQU|RAMP|PULS|PRN|DC`
 *   - `SOURce<n>:FREQuency <Hz>`, `:VOLTage <Vpp>`, `:VOLTage:OFFSet`,
 *     `:PHASe <deg>`, `:PULSe:DCYCle|:WIDTh`
 *   - `OUTPut<n>:STATe ON|OFF`, `OUTPut<n>:IMPedance <50|INFinity>`
 *
 * `AFG31000` is the newest line and carries the biggest arbitrary
 * memory; `AFG1000` is the narrow entry line (single-channel only,
 * small arb).
 */
export interface AfgProfile {
  readonly variant: string;
  readonly channelCount: 1 | 2;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly arbitraryMaxSamples: number;
  readonly sampleRateMaxHz: number;
  readonly presetSlots: number;
}

export const AFG_VARIANTS: readonly AfgProfile[] = [
  // ---- AFG1000 — entry single channel ----
  {
    variant: "AFG1022",
    channelCount: 2,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 8_192,
    sampleRateMaxHz: 125e6,
    presetSlots: 4,
  },
  {
    variant: "AFG1062",
    channelCount: 2,
    frequencyMaxHz: 60e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 8_192,
    sampleRateMaxHz: 300e6,
    presetSlots: 4,
  },
  // ---- AFG3000C ----
  {
    variant: "AFG3011C",
    channelCount: 1,
    frequencyMaxHz: 10e6,
    amplitudeMaxVpp: 20,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "AFG3021C",
    channelCount: 1,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "AFG3022C",
    channelCount: 2,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 250e6,
    presetSlots: 4,
  },
  {
    variant: "AFG3051C",
    channelCount: 1,
    frequencyMaxHz: 50e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "AFG3052C",
    channelCount: 2,
    frequencyMaxHz: 50e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "AFG3101C",
    channelCount: 1,
    frequencyMaxHz: 100e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "AFG3102C",
    channelCount: 2,
    frequencyMaxHz: 100e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 1e9,
    presetSlots: 4,
  },
  {
    variant: "AFG3251C",
    channelCount: 1,
    frequencyMaxHz: 240e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 2e9,
    presetSlots: 4,
  },
  {
    variant: "AFG3252C",
    channelCount: 2,
    frequencyMaxHz: 240e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 131_072,
    sampleRateMaxHz: 2e9,
    presetSlots: 4,
  },
  // ---- AFG31000 ----
  {
    variant: "AFG31021",
    channelCount: 1,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 8,
  },
  {
    variant: "AFG31022",
    channelCount: 2,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 250e6,
    presetSlots: 8,
  },
  {
    variant: "AFG31051",
    channelCount: 1,
    frequencyMaxHz: 50e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 500e6,
    presetSlots: 8,
  },
  {
    variant: "AFG31052",
    channelCount: 2,
    frequencyMaxHz: 50e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 500e6,
    presetSlots: 8,
  },
  {
    variant: "AFG31101",
    channelCount: 1,
    frequencyMaxHz: 100e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 1e9,
    presetSlots: 8,
  },
  {
    variant: "AFG31102",
    channelCount: 2,
    frequencyMaxHz: 100e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 1e9,
    presetSlots: 8,
  },
  {
    variant: "AFG31151",
    channelCount: 1,
    frequencyMaxHz: 150e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 2e9,
    presetSlots: 8,
  },
  {
    variant: "AFG31152",
    channelCount: 2,
    frequencyMaxHz: 150e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 2e9,
    presetSlots: 8,
  },
  {
    variant: "AFG31251",
    channelCount: 1,
    frequencyMaxHz: 250e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 2e9,
    presetSlots: 8,
  },
  {
    variant: "AFG31252",
    channelCount: 2,
    frequencyMaxHz: 250e6,
    amplitudeMaxVpp: 10,
    arbitraryMaxSamples: 16_000_000,
    sampleRateMaxHz: 2e9,
    presetSlots: 8,
  },
];

/** Conservative catch-all: dual 25 MHz / 10 Vpp / small arb. */
export const AFG_DEFAULT: AfgProfile = {
  variant: "AFGxxxx",
  channelCount: 2,
  frequencyMaxHz: 25e6,
  amplitudeMaxVpp: 10,
  arbitraryMaxSamples: 16_384,
  sampleRateMaxHz: 250e6,
  presetSlots: 4,
};

/**
 * AFG refinement: `*OPT?` advertises firmware add-ons and arbitrary
 * memory upgrades (`ARB+`, `MEM2`, `DG` on AFG31000). The hook is
 * observational for the 4.7 facade surface — widening arbitrary memory
 * would require a verified upload path, so we return the base unchanged.
 */
export async function refineAfgProfile(
  base: AfgProfile,
  port: ScpiPort,
): Promise<AfgProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
