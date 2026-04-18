import type { ScpiPort } from "../../scpi/port.js";
import type { OscilloscopeDecoderProtocol } from "../../facades/oscilloscope.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Tektronix MSO / DPO / MDO mid-to-flagship profile.
 *
 * Covers the following families under a shared SCPI dialect:
 *   - **MDO3000 / MDO4000C** — mixed-domain, RF front end optional.
 *   - **MSO/DPO 2000B / 3000 / 4000B** — four-channel mid-range, some
 *     with MSO digital channels via the `DSO-DPO2MSO` / `MDO4MSO` kit.
 *   - **MSO 5 Series / 6 Series B** — flagship 4-, 6-, 8-channel boxes;
 *     wider bandwidth option list, FlexChannel digitisers.
 *
 * Wire-level shape:
 *   - Waveform download uses the **binary `WFMOutpre?` + `CURVE?`** path:
 *       `DATa:SOUrce CH<n>; :DATa:ENCdg RIBinary; :DATa:WIDth 2`
 *       → `WFMOutpre:YMUlt?`, `:XINcr?`, `:XZEro?`, `:YOFf?`, `:YZEro?`
 *       → `CURVe?` returns IEEE 488.2 definite-length block of big-endian
 *         signed 16-bit integers (8-bit on legacy `RIB`/`RPB` WIDTh 1).
 *   - Trigger tree matches the TBS spelling (`TRIGger:A:EDGE:SOUrce`).
 *   - Decoders and digital channels are **option-gated**; `refineMso-
 *     Profile` narrows the advertised list from `*OPT?`.
 *
 * The driver advertises `trigger` + `acquisition` uniformly; decoders,
 * digital channels, and the MDO RF surface are narrowed via the profile
 * (facade fields stay undefined when the unit doesn't carry the option).
 */
export interface MsoProfile {
  readonly variant: string;
  readonly channels: 2 | 4 | 6 | 8;
  readonly bandwidthMhz: number;
  readonly sampleRateMsPs: number;
  readonly memoryDepthSamples: number;
  /** WFMOutpre:BYT_Nr default width (1 = 8-bit, 2 = 16-bit). */
  readonly sampleWidth: 1 | 2;
  /** 0 when the chassis does not advertise MSO digital lanes. */
  readonly digitalChannels: number;
  readonly decoders: readonly OscilloscopeDecoderProtocol[];
  /** True on MDO3000 / MDO4000C / MSO 6 B with the RF input installed. */
  readonly hasRf: boolean;
  /** Rough RF input ceiling (Hz); 0 when RF is absent. */
  readonly rfSpanMaxHz: number;
}

const SCOPE_DECODERS: readonly OscilloscopeDecoderProtocol[] = [
  "i2c",
  "spi",
  "uart",
  "can",
  "lin",
];

export const MSO_VARIANTS: readonly MsoProfile[] = [
  // ---- MDO3000 — mixed-domain; MSO/RF options available ----
  {
    variant: "MDO3012",
    channels: 2,
    bandwidthMhz: 100,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 10e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: true,
    rfSpanMaxHz: 3e9,
  },
  {
    variant: "MDO3104",
    channels: 4,
    bandwidthMhz: 1000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 10e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: true,
    rfSpanMaxHz: 9e9,
  },
  // ---- MDO4000C — successor; RF always installed ----
  {
    variant: "MDO4024C",
    channels: 4,
    bandwidthMhz: 200,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 20e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: true,
    rfSpanMaxHz: 3e9,
  },
  {
    variant: "MDO4054C",
    channels: 4,
    bandwidthMhz: 500,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 20e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: true,
    rfSpanMaxHz: 6e9,
  },
  {
    variant: "MDO4104C",
    channels: 4,
    bandwidthMhz: 1000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 20e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: true,
    rfSpanMaxHz: 6e9,
  },
  // ---- MSO/DPO 2000B ----
  {
    variant: "DPO2024B",
    channels: 4,
    bandwidthMhz: 200,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 1e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  {
    variant: "MSO2024B",
    channels: 4,
    bandwidthMhz: 200,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 1e6,
    sampleWidth: 1,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  // ---- MSO/DPO 3000 ----
  {
    variant: "DPO3034",
    channels: 4,
    bandwidthMhz: 300,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 5e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  {
    variant: "MSO3054",
    channels: 4,
    bandwidthMhz: 500,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 5e6,
    sampleWidth: 1,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  // ---- MSO/DPO 4000B ----
  {
    variant: "DPO4054B",
    channels: 4,
    bandwidthMhz: 500,
    sampleRateMsPs: 2500,
    memoryDepthSamples: 20e6,
    sampleWidth: 1,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  {
    variant: "MSO4104B",
    channels: 4,
    bandwidthMhz: 1000,
    sampleRateMsPs: 5000,
    memoryDepthSamples: 20e6,
    sampleWidth: 1,
    digitalChannels: 16,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  // ---- MSO 5 Series — 12-bit digitiser, FlexChannel ----
  {
    variant: "MSO54",
    channels: 4,
    bandwidthMhz: 1000,
    sampleRateMsPs: 6250,
    memoryDepthSamples: 62.5e6,
    sampleWidth: 2,
    digitalChannels: 8,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  {
    variant: "MSO56",
    channels: 6,
    bandwidthMhz: 2000,
    sampleRateMsPs: 6250,
    memoryDepthSamples: 62.5e6,
    sampleWidth: 2,
    digitalChannels: 8,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  {
    variant: "MSO58",
    channels: 8,
    bandwidthMhz: 2000,
    sampleRateMsPs: 6250,
    memoryDepthSamples: 62.5e6,
    sampleWidth: 2,
    digitalChannels: 8,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  // ---- MSO 6 Series B — flagship ----
  {
    variant: "MSO64B",
    channels: 4,
    bandwidthMhz: 8000,
    sampleRateMsPs: 25000,
    memoryDepthSamples: 125e6,
    sampleWidth: 2,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
  {
    variant: "MSO68B",
    channels: 8,
    bandwidthMhz: 10000,
    sampleRateMsPs: 25000,
    memoryDepthSamples: 125e6,
    sampleWidth: 2,
    digitalChannels: 0,
    decoders: SCOPE_DECODERS,
    hasRf: false,
    rfSpanMaxHz: 0,
  },
];

export const MSO_DEFAULT: MsoProfile = {
  variant: "MSOxxxx",
  channels: 4,
  bandwidthMhz: 500,
  sampleRateMsPs: 2500,
  memoryDepthSamples: 5e6,
  sampleWidth: 1,
  digitalChannels: 0,
  decoders: SCOPE_DECODERS,
  hasRf: false,
  rfSpanMaxHz: 0,
};

/**
 * MSO refinement. `*OPT?` on the 5/6 Series emits well-specified tokens:
 *
 *   - `RF` / `RF1`…`RF6` — MDO RF channel installed.
 *   - `MSO` / `MSO-LA` — MSO logic lanes enabled.
 *   - `SR-*` / `PWR-*` — protocol decoder bundles (`SR-I2C`, `SR-CAN`, …).
 *   - `BW-*` — bandwidth upgrade licence (we log the token but do not
 *     silently raise `bandwidthMhz`; hardware upload is the only truth).
 *
 * Failure modes: `*OPT?` occasionally times out under heavy scope load.
 * We swallow the error and return the base profile.
 */
export async function refineMsoProfile(
  base: MsoProfile,
  port: ScpiPort,
): Promise<MsoProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;

  let hasRf = base.hasRf;
  let digitalChannels = base.digitalChannels;
  const decoders = new Set<OscilloscopeDecoderProtocol>(base.decoders);

  for (const tok of options) {
    const u = tok.toUpperCase();
    if (/^RF(\d|$)/.test(u)) hasRf = true;
    if (u === "MSO" || u === "MSO-LA" || u === "DPO2MSO") {
      if (digitalChannels === 0) digitalChannels = 16;
    }
    if (/SR-?I2C/.test(u)) decoders.add("i2c");
    if (/SR-?SPI/.test(u)) decoders.add("spi");
    if (/SR-?(RS232|UART)/.test(u)) decoders.add("uart");
    if (/SR-?CAN/.test(u)) decoders.add("can");
    if (/SR-?LIN/.test(u)) decoders.add("lin");
  }

  return {
    ...base,
    hasRf,
    digitalChannels,
    decoders: [...decoders],
  };
}
