import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Tektronix TBS entry-scope profile.
 *
 * Covers the TBS1000C and TBS2000B ranges — USB-centric benchscopes that
 * also expose an LXI socket on firmware revisions ≥ v1.30. Waveform
 * download on TBS uses the legacy **ASCII `CURVE?`** path: the preamble
 * (`WFMPre:YMULT?`, `WFMPre:XINCR?`, `WFMPre:PT_OFF?`) is decoded as
 * scalars and the `CURVE?` reply is a comma-separated list of signed
 * 8-bit integers. The binary `WFMOutpre?` tree that the 4 Series / 5
 * Series / 6 Series exposes is **not** advertised on TBS.
 *
 * Advertised capabilities are deliberately narrow:
 *   - `trigger.types = ['edge']`
 *   - `acquisition.modes = ['normal', 'average', 'peakDetect']`
 * Decoders, math, references, history, measurements, cursors are not
 * reached on the wire — the facade's optional capability fields are
 * left undefined so the UI hides those tabs.
 */
export interface TbsProfile {
  readonly variant: string;
  readonly channels: 2 | 4;
  readonly bandwidthMhz: number;
  readonly sampleRateMsPs: number;
  readonly memoryDepthSamples: number;
  /**
   * TBS preamble fields are gettable but not settable; firmware always
   * serves 8-bit samples. Kept here for forward compatibility if a
   * future firmware widens this — drivers read the flag to pick the
   * right decoder.
   */
  readonly sampleWidth: 8 | 16;
}

export const TBS_VARIANTS: readonly TbsProfile[] = [
  // ---- TBS1000C entry 2-channel USB/LAN scopes ----
  {
    variant: "TBS1052C",
    channels: 2,
    bandwidthMhz: 50,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 20_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS1072C",
    channels: 2,
    bandwidthMhz: 70,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 20_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS1102C",
    channels: 2,
    bandwidthMhz: 100,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 20_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS1202C",
    channels: 2,
    bandwidthMhz: 200,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 20_000,
    sampleWidth: 8,
  },
  // ---- TBS2000B — 2/4-channel ----
  {
    variant: "TBS2072B",
    channels: 2,
    bandwidthMhz: 70,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 5_000_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS2102B",
    channels: 2,
    bandwidthMhz: 100,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 5_000_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS2074B",
    channels: 4,
    bandwidthMhz: 70,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 5_000_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS2104B",
    channels: 4,
    bandwidthMhz: 100,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 5_000_000,
    sampleWidth: 8,
  },
  {
    variant: "TBS2204B",
    channels: 4,
    bandwidthMhz: 200,
    sampleRateMsPs: 1000,
    memoryDepthSamples: 5_000_000,
    sampleWidth: 8,
  },
];

/** Catch-all: the most common TBS is a 100 MHz / 2 ch box. */
export const TBS_DEFAULT: TbsProfile = {
  variant: "TBSxxxx",
  channels: 2,
  bandwidthMhz: 100,
  sampleRateMsPs: 1000,
  memoryDepthSamples: 20_000,
  sampleWidth: 8,
};

/**
 * TBS refinement is observational only — `*OPT?` on the 1000C/2000B
 * firmware rarely advertises channel or bandwidth upgrades (and the
 * ones it does advertise are non-transferable over SCPI). The hook is
 * kept for parity with the other families; failure returns `base`.
 */
export async function refineTbsProfile(
  base: TbsProfile,
  port: ScpiPort,
): Promise<TbsProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
