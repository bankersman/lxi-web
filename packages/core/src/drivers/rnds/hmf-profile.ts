import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Rohde & Schwarz / Hameg arbitrary / function-generator profile.
 *
 * Covers the entry lab generators that use the SCPI-99 `SOURce:FUNCtion`
 * / `FREQuency` / `VOLTage` / `OUTPut` tree:
 *   - **HMF2550 / HMF2525** — 25 / 50 MHz AWGs (Hameg heritage; IDN
 *     typically reports `HAMEG,HMF2550,…`).
 *
 * Preview surface: sine/square/ramp/pulse/noise/DC waveforms plus
 * amplitude/offset/frequency/phase controls. Burst / sweep /
 * modulation are `SOURce<n>:BURSt`, `:SWEep`, `:AM|FM|PM|PWM`; left
 * for a follow-up.
 *
 * Note: HMC804x SKUs (`HMC8041` / `HMC8042` / `HMC8043`) are the
 * Hameg-platform **3-channel DC PSUs** — they belong to the NGx power
 * supply driver and are registered through `NGE_VARIANTS` instead.
 */
export interface HmfProfile {
  readonly variant: string;
  readonly channelCount: 1 | 2 | 3;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly presetSlots: number;
  readonly hamegLegacy: boolean;
}

export const HMF_VARIANTS: readonly HmfProfile[] = [
  {
    variant: "HMF2525",
    channelCount: 1,
    frequencyMaxHz: 25e6,
    amplitudeMaxVpp: 10,
    presetSlots: 10,
    hamegLegacy: true,
  },
  {
    variant: "HMF2550",
    channelCount: 1,
    frequencyMaxHz: 50e6,
    amplitudeMaxVpp: 10,
    presetSlots: 10,
    hamegLegacy: true,
  },
];

export const HMF_DEFAULT: HmfProfile = {
  variant: "HMFxxxx",
  channelCount: 1,
  frequencyMaxHz: 25e6,
  amplitudeMaxVpp: 10,
  presetSlots: 10,
  hamegLegacy: true,
};

export async function refineHmfProfile(
  base: HmfProfile,
  port: ScpiPort,
): Promise<HmfProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
