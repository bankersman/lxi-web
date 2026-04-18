import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Owon XDS entry-scope profile.
 *
 * XDS3000-series firmware responds to a **subset** of the SCPI-1999
 * oscilloscope tree — enough to drive channels, timebase, trigger,
 * single acquisition, and waveform download. It does **not** expose:
 *   - Decoders (no `:BUS` / `:DECode` commands).
 *   - References (no `:REFerence` slots).
 *   - Acquisition history / segmented memory.
 *   - Math beyond a fixed FFT panel that isn't addressable via SCPI.
 *
 * The driver therefore advertises only the core capabilities; the
 * optional catalogs (`decoders`, `references`, `history`, `math`) are
 * intentionally undefined on the facade so the UI hides their tabs.
 */
export interface XdsProfile {
  readonly variant: string;
  readonly channels: number;
  readonly bandwidthMhz: number;
  readonly maxSampleRateMsPs: number;
  readonly memoryDepthSamples: number;
  readonly presetSlots: number;
}

export const XDS_VARIANTS: readonly XdsProfile[] = [
  {
    // 4 ch, 100 MHz, 1 GSa/s — classic entry-level Owon LXI scope.
    variant: "XDS3102A",
    channels: 4,
    bandwidthMhz: 100,
    maxSampleRateMsPs: 1000,
    memoryDepthSamples: 40e6,
    presetSlots: 0,
  },
  {
    // Same front end as XDS3102A, with double-channel AE spec.
    variant: "XDS3104AE",
    channels: 4,
    bandwidthMhz: 100,
    maxSampleRateMsPs: 1000,
    memoryDepthSamples: 40e6,
    presetSlots: 0,
  },
];

/** Conservative catch-all: 4ch / 100 MHz is Owon's most common LXI scope. */
export const XDS_DEFAULT: XdsProfile = {
  variant: "XDS3xxxx",
  channels: 4,
  bandwidthMhz: 100,
  maxSampleRateMsPs: 1000,
  memoryDepthSamples: 10e6,
  presetSlots: 0,
};

/**
 * XDS refinement: `*OPT?` is inconsistently honoured on XDS firmware.
 * We probe it for completeness and return the base profile unchanged
 * — decoders and bandwidth upgrades are not advertised on this family.
 */
export async function refineXdsProfile(
  base: XdsProfile,
  port: ScpiPort,
): Promise<XdsProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
