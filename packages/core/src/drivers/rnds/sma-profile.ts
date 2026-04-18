import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Rohde & Schwarz analog / vector signal-generator profile.
 *
 * Covers the SMA / SMB / SMBV product line which share the
 * `SOURce<n>:FREQuency`, `SOURce<n>:POWer`, `SOURce<n>:AM|FM|PM|SWEep`
 * SCPI shape:
 *   - **SMA100A / SMA100B** — analog signal generators up to 40 / 67 GHz.
 *   - **SMB100A** — analog signal generator, low-phase-noise tier.
 *   - **SMBV100A / SMBV100B** — vector signal generators.
 *
 * R&S signal generators only expose a single RF port, so the
 * `ISignalGenerator` channel list always has one entry. Amplitude is
 * reported and commanded in **dBm** on SMA/SMB/SMBV rather than Vpp;
 * we surface the control as amplitude-Vpp for API-shape parity with
 * the Keysight 33500 family and translate on the way out (50 Ω Vpp ↔
 * dBm via the standard `20·log10(Vpp / (2·√2))` – 13.01 conversion).
 * Callers that need absolute dBm can drive the underlying SCPI
 * directly through the port; the facade keeps the abstraction stable.
 */
export interface SmaProfile {
  readonly variant: string;
  readonly family: "SMA" | "SMB" | "SMBV";
  readonly frequencyMinHz: number;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxDbm: number;
  readonly presetSlots: number;
  /** True on SMBV100A/B vector generators — enables modulation tree. */
  readonly hasVector: boolean;
}

export const SMA_VARIANTS: readonly SmaProfile[] = [
  // ---- SMA100 analog ----
  {
    variant: "SMA100A",
    family: "SMA",
    frequencyMinHz: 9e3,
    frequencyMaxHz: 40e9,
    amplitudeMaxDbm: 27,
    presetSlots: 10,
    hasVector: false,
  },
  {
    variant: "SMA100B",
    family: "SMA",
    frequencyMinHz: 8e3,
    frequencyMaxHz: 67e9,
    amplitudeMaxDbm: 27,
    presetSlots: 10,
    hasVector: false,
  },
  // ---- SMB100A analog ----
  {
    variant: "SMB100A",
    family: "SMB",
    frequencyMinHz: 9e3,
    frequencyMaxHz: 40e9,
    amplitudeMaxDbm: 22,
    presetSlots: 10,
    hasVector: false,
  },
  // ---- SMBV100 vector ----
  {
    variant: "SMBV100A",
    family: "SMBV",
    frequencyMinHz: 9e3,
    frequencyMaxHz: 6e9,
    amplitudeMaxDbm: 18,
    presetSlots: 10,
    hasVector: true,
  },
  {
    variant: "SMBV100B",
    family: "SMBV",
    frequencyMinHz: 8e3,
    frequencyMaxHz: 7.5e9,
    amplitudeMaxDbm: 18,
    presetSlots: 10,
    hasVector: true,
  },
];

export const SMA_DEFAULT: SmaProfile = {
  variant: "SMAxxxx",
  family: "SMA",
  frequencyMinHz: 9e3,
  frequencyMaxHz: 6e9,
  amplitudeMaxDbm: 18,
  presetSlots: 10,
  hasVector: false,
};

/**
 * `*OPT?` on SMA/SMB/SMBV advertises bandwidth / frequency-tier
 * licences. We log the tokens but don't widen `frequencyMaxHz`
 * silently — hardware upload is the only truth. Vector-modulation
 * option `K1` toggles `hasVector`.
 */
export async function refineSmaProfile(
  base: SmaProfile,
  port: ScpiPort,
): Promise<SmaProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;
  let hasVector = base.hasVector;
  for (const tok of options) {
    if (/^K1\b|VECTOR/i.test(tok)) hasVector = true;
  }
  return { ...base, hasVector };
}
