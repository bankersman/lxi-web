import type { ScpiPort } from "../../scpi/port.js";
import type { OscilloscopeDecoderProtocol } from "../../facades/oscilloscope.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Rohde & Schwarz oscilloscope profile.
 *
 * Covers the following families under a shared SCPI dialect:
 *   - **RTB2000** — entry 4-channel 70 / 100 / 200 / 300 MHz.
 *   - **RTM3000** — mid-range 4-channel 200 MHz – 1 GHz.
 *   - **RTA4000** — deep-memory lab scope, FlexChannel digitisers.
 *   - **MXO 4 / MXO 5** — current-gen 4 / 6 / 8-channel flagships.
 *   - **HMO1002 / HMO1202 / HMO2024** — legacy Hameg-branded scopes
 *     which still report `HAMEG,HMOxxxx,…` on the wire.
 *
 * Wire-level shape:
 *   - Channel tree: `CHANnel<n>:STATe?`, `:SCALe?`, `:OFFSet?`,
 *     `:COUPling?`, `:POLarity?`.
 *   - Timebase: `TIMebase:SCALe?`, `:POSition?`.
 *   - Trigger: `TRIGger:A:EDGE:SOURce?`, `:TYPE?`, `:LEVel<n>?`.
 *   - Acquisition: `ACQuire:STATe RUN|STOP`, `ACQuire:MODE`.
 *   - Waveform download via `CHANnel<n>:DATA?` returning an IEEE 488.2
 *     definite-length binary block with a matching
 *     `CHANnel<n>:DATA:HEADer?` preamble (x-start, x-stop, record
 *     length, values-per-interval). Much simpler than the Keysight
 *     InfiniiVision or Rigol DHO800 layouts.
 *
 * The driver advertises `trigger` + `acquisition` uniformly; the
 * decoder catalogue and digital-channel count are option-gated and
 * refined from `*OPT?`.
 */
export interface RtbProfile {
  readonly variant: string;
  readonly family: "RTB" | "RTM" | "RTA" | "MXO" | "HMO";
  readonly channels: 2 | 4 | 6 | 8;
  readonly bandwidthMhz: number;
  readonly sampleRateMsPs: number;
  readonly memoryDepthSamples: number;
  /** True on MXO and HMO legacy scopes that default to 8-bit digitiser. */
  readonly sampleWidth: 1 | 2;
  /** 0 when the chassis has no MSO logic lanes. */
  readonly digitalChannels: number;
  readonly decoders: readonly OscilloscopeDecoderProtocol[];
  /** Hameg-era firmware identifies as `HAMEG` rather than R&S. */
  readonly hamegLegacy: boolean;
}

const SCOPE_DECODERS: readonly OscilloscopeDecoderProtocol[] = [
  "i2c",
  "spi",
  "uart",
  "can",
  "lin",
];

export const RTB_VARIANTS: readonly RtbProfile[] = [
  // ---- RTB2000 entry 4-channel ----
  {
    variant: "RTB2002",
    family: "RTB",
    channels: 2,
    bandwidthMhz: 70,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 20_000_000,
    sampleWidth: 2,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  {
    variant: "RTB2004",
    family: "RTB",
    channels: 4,
    bandwidthMhz: 300,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 20_000_000,
    sampleWidth: 2,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  // ---- RTM3000 mid-range ----
  {
    variant: "RTM3002",
    family: "RTM",
    channels: 2,
    bandwidthMhz: 1000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 40_000_000,
    sampleWidth: 2,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  {
    variant: "RTM3004",
    family: "RTM",
    channels: 4,
    bandwidthMhz: 1000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 40_000_000,
    sampleWidth: 2,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  // ---- RTA4000 deep-memory lab scope ----
  {
    variant: "RTA4004",
    family: "RTA",
    channels: 4,
    bandwidthMhz: 1000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 100_000_000,
    sampleWidth: 2,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  // ---- MXO flagship ----
  {
    variant: "MXO44",
    family: "MXO",
    channels: 4,
    bandwidthMhz: 1500,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 400_000_000,
    sampleWidth: 2,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  {
    variant: "MXO54",
    family: "MXO",
    channels: 4,
    bandwidthMhz: 2000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 500_000_000,
    sampleWidth: 2,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  {
    variant: "MXO58",
    family: "MXO",
    channels: 8,
    bandwidthMhz: 2000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 500_000_000,
    sampleWidth: 2,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hamegLegacy: false,
  },
  // ---- HMO legacy (Hameg-branded; still reports HAMEG) ----
  {
    variant: "HMO1002",
    family: "HMO",
    channels: 2,
    bandwidthMhz: 50,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 1_000_000,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hamegLegacy: true,
  },
  {
    variant: "HMO1202",
    family: "HMO",
    channels: 2,
    bandwidthMhz: 100,
    sampleRateMsPs: 2000,
    memoryDepthSamples: 1_000_000,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hamegLegacy: true,
  },
  {
    variant: "HMO2024",
    family: "HMO",
    channels: 4,
    bandwidthMhz: 200,
    sampleRateMsPs: 2000,
    memoryDepthSamples: 2_000_000,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hamegLegacy: true,
  },
];

export const RTB_DEFAULT: RtbProfile = {
  variant: "RTBxxxx",
  family: "RTB",
  channels: 4,
  bandwidthMhz: 100,
  sampleRateMsPs: 2500,
  memoryDepthSamples: 20_000_000,
  sampleWidth: 2,
  digitalChannels: 0,
  decoders: SCOPE_DECODERS,
  hamegLegacy: false,
};

/**
 * RTB / RTM / RTA / MXO refinement. `*OPT?` advertises:
 *   - `B1` — digital-channel MSO option for RTB/RTM/RTA (adds 16 lanes).
 *   - `K1` / `K2` / `K3` — serial-decoder bundles (I²C/SPI, UART, CAN).
 *   - `K5` / `K50` — power-analysis bundles (not modelled here).
 *   - `HV-EXT` — extended memory.
 *
 * Network hiccups or unsupported `*OPT?` return the base profile.
 */
export async function refineRtbProfile(
  base: RtbProfile,
  port: ScpiPort,
): Promise<RtbProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;

  let digitalChannels = base.digitalChannels;
  const decoders = new Set<OscilloscopeDecoderProtocol>(base.decoders);

  for (const tok of options) {
    const u = tok.toUpperCase();
    if (u === "B1") {
      if (digitalChannels === 0) digitalChannels = 16;
    }
    if (/^K1\b|I2C|SPI/.test(u)) {
      decoders.add("i2c");
      decoders.add("spi");
    }
    if (/^K2\b|UART|RS232/.test(u)) decoders.add("uart");
    if (/^K3\b|CAN|LIN/.test(u)) {
      decoders.add("can");
      decoders.add("lin");
    }
  }

  return {
    ...base,
    digitalChannels,
    decoders: [...decoders],
  };
}
