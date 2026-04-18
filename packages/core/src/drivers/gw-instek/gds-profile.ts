import type { ScpiPort } from "../../scpi/port.js";
import type { OscilloscopeDecoderProtocol } from "../../facades/oscilloscope.js";
import { queryOptList } from "./_shared/index.js";

/**
 * GW Instek GDS / MSO / MPO / MDO-2000 oscilloscope profile.
 *
 * GDS firmware is **family-level** uneven: GDS-1000B is narrow, GDS-2000E
 * adds serial decoders, GDS-3000 adds CAN/LIN, and the MDO/MPO variants
 * layer on a thin built-in spectrum / source. We gate capabilities via
 * per-variant profile fields rather than trying to refine them all at
 * runtime — `*OPT?` on GW Instek firmware is unreliable.
 */
export interface GdsProfile {
  readonly variant: string;
  readonly channels: 2 | 4;
  readonly bandwidthMhz: number;
  readonly digitalChannels: 0 | 16;
  readonly decoders: readonly OscilloscopeDecoderProtocol[];
  readonly memoryDepth: "auto" | "10k" | "10M";
  readonly maxSampleRateSps: number;
}

const DEC_BASIC: readonly OscilloscopeDecoderProtocol[] = [];
const DEC_MID: readonly OscilloscopeDecoderProtocol[] = ["i2c", "spi", "uart"];
const DEC_FULL: readonly OscilloscopeDecoderProtocol[] = [
  "i2c",
  "spi",
  "uart",
  "can",
  "lin",
];

export const GDS_VARIANTS: readonly GdsProfile[] = [
  // GDS-1000B — entry 50 MHz / 70 MHz, no decoders.
  {
    variant: "GDS-1054B",
    channels: 4,
    bandwidthMhz: 50,
    digitalChannels: 0,
    decoders: DEC_BASIC,
    memoryDepth: "10k",
    maxSampleRateSps: 1e9,
  },
  {
    variant: "GDS-1074B",
    channels: 4,
    bandwidthMhz: 70,
    digitalChannels: 0,
    decoders: DEC_BASIC,
    memoryDepth: "10k",
    maxSampleRateSps: 1e9,
  },
  // GDS-2000E — mid-range, serial decoders.
  {
    variant: "GDS-2102E",
    channels: 2,
    bandwidthMhz: 100,
    digitalChannels: 0,
    decoders: DEC_MID,
    memoryDepth: "10M",
    maxSampleRateSps: 1e9,
  },
  {
    variant: "GDS-2204E",
    channels: 4,
    bandwidthMhz: 200,
    digitalChannels: 0,
    decoders: DEC_MID,
    memoryDepth: "10M",
    maxSampleRateSps: 1e9,
  },
  // GDS-3000 — CAN/LIN + optional MSO.
  {
    variant: "GDS-3352",
    channels: 4,
    bandwidthMhz: 350,
    digitalChannels: 0,
    decoders: DEC_FULL,
    memoryDepth: "10M",
    maxSampleRateSps: 5e9,
  },
  // MSO-2000 — adds 16-channel logic pod.
  {
    variant: "MSO-2204",
    channels: 4,
    bandwidthMhz: 200,
    digitalChannels: 16,
    decoders: DEC_MID,
    memoryDepth: "10M",
    maxSampleRateSps: 1e9,
  },
  // MDO-2000EX — mixed-domain, reuses GDS scope surface.
  {
    variant: "MDO-2302EX",
    channels: 2,
    bandwidthMhz: 300,
    digitalChannels: 0,
    decoders: DEC_MID,
    memoryDepth: "10M",
    maxSampleRateSps: 2e9,
  },
];

export const GDS_DEFAULT: GdsProfile = GDS_VARIANTS[0]!;

/**
 * `*OPT?` on GDS firmware is unreliable — some variants echo the front
 * panel key labels, others return the serial number. We keep the refine
 * hook as a no-op but expose it so the registry plumbing is uniform.
 */
export async function refineGdsProfile(
  base: GdsProfile,
  port: ScpiPort,
): Promise<GdsProfile> {
  const opts = await queryOptList(port);
  void opts;
  return base;
}
