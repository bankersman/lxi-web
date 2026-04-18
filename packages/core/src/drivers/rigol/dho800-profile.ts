import type { ScpiPort } from "../../scpi/port.js";
import type {
  OscilloscopeChannelBandwidthLimit,
  OscilloscopeDecoderProtocol,
  OscilloscopeMemoryDepth,
} from "../../facades/oscilloscope.js";
import { parseBool, queryOptList } from "./_shared/index.js";

export type DhoChannelCount = 2 | 4;
export type DhoBandwidth = 70 | 100 | 200 | 250;

/**
 * Variant-specific capability profile for the Rigol DHO800 oscilloscope
 * family. The same driver class (`RigolDho800`) handles every SKU; the
 * profile is what changes between DHO802 and DHO814.
 */
export interface Dho800Profile {
  readonly variant: string;
  readonly channels: DhoChannelCount;
  readonly bandwidthMhz: DhoBandwidth;
  readonly bwLimits: readonly OscilloscopeChannelBandwidthLimit[];
  readonly memoryDepths: readonly OscilloscopeMemoryDepth[];
  readonly decoderBuses: number;
  readonly decoderProtocols: readonly OscilloscopeDecoderProtocol[];
  readonly referenceSlots: number;
}

// DHO800 bandwidth-limit ladder mirrors the front-panel softkey options at
// each SKU's bandwidth ceiling: 20 MHz is universal, 100 MHz shows up on
// 200+ MHz units, 200 MHz only on top-bin 250 MHz units.
function bwLimitsFor(bandwidthMhz: DhoBandwidth): readonly OscilloscopeChannelBandwidthLimit[] {
  if (bandwidthMhz >= 250) return ["off", "20M", "100M", "200M"];
  if (bandwidthMhz >= 200) return ["off", "20M", "100M"];
  return ["off", "20M"];
}

const FULL_DECODER_SET: readonly OscilloscopeDecoderProtocol[] = [
  "i2c",
  "spi",
  "uart",
  "can",
  "lin",
];

const STANDARD_MDEPTHS: readonly OscilloscopeMemoryDepth[] = [
  "auto",
  "1k",
  "10k",
  "100k",
  "1M",
  "10M",
  "25M",
];

function makeProfile(
  variant: string,
  channels: DhoChannelCount,
  bandwidthMhz: DhoBandwidth,
): Dho800Profile {
  return {
    variant,
    channels,
    bandwidthMhz,
    bwLimits: bwLimitsFor(bandwidthMhz),
    memoryDepths: STANDARD_MDEPTHS,
    decoderBuses: 2,
    decoderProtocols: FULL_DECODER_SET,
    referenceSlots: 10,
  };
}

// Known DHO800-series variants. Ordering matters: the registry iterates
// this list and registers a matcher per variant. Models with the same
// numeric prefix (e.g. DHO804 vs DHO804-EDU) resolve by the most specific
// suffix because the per-variant regex is anchored to a word boundary.
export const DHO800_VARIANTS: readonly Dho800Profile[] = [
  makeProfile("DHO802", 2, 70),
  makeProfile("DHO804", 4, 70),
  makeProfile("DHO812", 2, 100),
  makeProfile("DHO814", 4, 100),
];

/**
 * Conservative catch-all profile: 4 channels (most common SKU), lowest
 * bandwidth in the family, and the full standard feature set. Used when
 * `*IDN?` matches the family pattern but the specific model is unknown.
 * The refine() hook narrows this at connect time whenever possible.
 */
export const DHO800_DEFAULT: Dho800Profile = {
  variant: "DHO8xx",
  channels: 4,
  bandwidthMhz: 70,
  bwLimits: bwLimitsFor(70),
  memoryDepths: STANDARD_MDEPTHS,
  decoderBuses: 2,
  decoderProtocols: FULL_DECODER_SET,
  referenceSlots: 10,
};

const DECODER_OPTION_MAP: Readonly<Record<string, OscilloscopeDecoderProtocol>> = {
  "SD-IIC": "i2c",
  "SD-SPI": "spi",
  "SD-RS232": "uart",
  "SD-UART": "uart",
  "SD-CAN": "can",
  "SD-LIN": "lin",
};

/**
 * Runtime refinement: probe `*OPT?` to learn which decoders are actually
 * licensed and which channels physically exist. The profile is only
 * narrowed, never widened — bandwidth upgrades would need a separate
 * licensed-bandwidth table per family and those aren't published as an
 * `*OPT?` token today.
 */
export async function refineDho800Profile(
  base: Dho800Profile,
  port: ScpiPort,
): Promise<Dho800Profile> {
  const [options, channels] = await Promise.all([
    queryOptList(port),
    probeChannelCount(port, base.channels),
  ]);

  let decoderProtocols = base.decoderProtocols;
  if (options.length > 0) {
    const licensed = new Set<OscilloscopeDecoderProtocol>();
    for (const opt of options) {
      const key = opt.toUpperCase();
      const protocol = DECODER_OPTION_MAP[key];
      if (protocol) licensed.add(protocol);
    }
    // Only tighten the list when we actually saw decoder-license tokens —
    // some firmware revisions report nothing at all, and we'd rather
    // assume the decoder is there than lock it out on a false negative.
    if (licensed.size > 0) {
      decoderProtocols = base.decoderProtocols.filter((p) => licensed.has(p));
    }
  }

  if (channels === base.channels && decoderProtocols === base.decoderProtocols) {
    return base;
  }
  return { ...base, channels, decoderProtocols };
}

/**
 * Probe `:CHANnel<N>:DISPlay?` for N = 3, 4 to decide whether this is a
 * 2-channel variant sold as a 4-channel chassis. Firmware replies with an
 * `undefined header` or throws when the channel doesn't exist, which we
 * treat as "no such channel".
 */
async function probeChannelCount(
  port: ScpiPort,
  assumed: DhoChannelCount,
): Promise<DhoChannelCount> {
  if (assumed === 2) return 2;
  try {
    const response = await port.query(":CHANnel4:DISPlay?", { timeoutMs: 500 });
    if (response.trim().length === 0) return 2;
    // Any well-formed `0/1/ON/OFF` answer means the channel exists.
    parseBool(response);
    return 4;
  } catch {
    return 2;
  }
}
