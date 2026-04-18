import type { ScpiPort } from "../../scpi/port.js";
import { parseOptList } from "./_shared/index.js";

export interface Dg900Profile {
  readonly variant: string;
  readonly family: "DG800" | "DG900";
  readonly channelCount: 1 | 2;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly sampleRateMaxHz: number;
  readonly arbitraryMaxSamples: number;
  readonly presetSlots: number;
}

/**
 * DG800 / DG900 variants. Sine-wave bandwidth is the headline spec; square /
 * pulse max frequency is substantially lower and is clamped by the simulator
 * and the driver from this table. The `DG811` / `DG821` etc. single-channel
 * entries are more common than the Pro series, so we list the base models
 * and let the catch-all regex handle suffixes (`-P`, `-A` Pro variants).
 */
export const DG900_VARIANTS: readonly Dg900Profile[] = [
  {
    variant: "DG811",
    family: "DG800",
    channelCount: 1,
    frequencyMaxHz: 10e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 125e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 10,
  },
  {
    variant: "DG812",
    family: "DG800",
    channelCount: 2,
    frequencyMaxHz: 10e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 125e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 10,
  },
  {
    variant: "DG821",
    family: "DG800",
    channelCount: 1,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 125e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 10,
  },
  {
    variant: "DG822",
    family: "DG800",
    channelCount: 2,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 125e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 10,
  },
  {
    variant: "DG831",
    family: "DG800",
    channelCount: 1,
    frequencyMaxHz: 35e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 125e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 10,
  },
  {
    variant: "DG832",
    family: "DG800",
    channelCount: 2,
    frequencyMaxHz: 35e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 125e6,
    arbitraryMaxSamples: 16_384,
    presetSlots: 10,
  },
  {
    variant: "DG922",
    family: "DG900",
    channelCount: 2,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 250e6,
    arbitraryMaxSamples: 16_384_000,
    presetSlots: 10,
  },
  {
    variant: "DG932",
    family: "DG900",
    channelCount: 2,
    frequencyMaxHz: 35e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 250e6,
    arbitraryMaxSamples: 16_384_000,
    presetSlots: 10,
  },
  {
    variant: "DG952",
    family: "DG900",
    channelCount: 2,
    frequencyMaxHz: 50e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 250e6,
    arbitraryMaxSamples: 16_384_000,
    presetSlots: 10,
  },
  {
    variant: "DG972",
    family: "DG900",
    channelCount: 2,
    frequencyMaxHz: 70e6,
    amplitudeMaxVpp: 20,
    sampleRateMaxHz: 250e6,
    arbitraryMaxSamples: 16_384_000,
    presetSlots: 10,
  },
];

export const DG800_DEFAULT: Dg900Profile = {
  variant: "DG8xx",
  family: "DG800",
  channelCount: 2,
  frequencyMaxHz: 10e6,
  amplitudeMaxVpp: 20,
  sampleRateMaxHz: 125e6,
  arbitraryMaxSamples: 16_384,
  presetSlots: 10,
};

export const DG900_DEFAULT: Dg900Profile = {
  variant: "DG9xx",
  family: "DG900",
  channelCount: 2,
  frequencyMaxHz: 25e6,
  amplitudeMaxVpp: 20,
  sampleRateMaxHz: 250e6,
  arbitraryMaxSamples: 16_384_000,
  presetSlots: 10,
};

/**
 * `*OPT?` on the DG800 / DG900 reports licensed features. We don't lean on
 * it today — every currently-shipping unit exposes the full SCPI tree — but
 * the probe is still called to keep the pattern uniform with sibling
 * driver families and future-proof for license-gated capabilities.
 */
export async function refineDg900Profile(
  base: Dg900Profile,
  port: ScpiPort,
): Promise<Dg900Profile> {
  try {
    const raw = await port.query("*OPT?", { timeoutMs: 1000 });
    parseOptList(raw);
  } catch {
    /* ignore — purely observational today */
  }
  return base;
}
