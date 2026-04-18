import type { ScpiPort } from "../../scpi/port.js";
import { parseBool } from "./_shared/index.js";

export interface Dp900ChannelProfile {
  readonly id: number;
  readonly voltageMax: number;
  readonly currentMax: number;
  readonly ovpRange: { readonly min: number; readonly max: number };
  readonly ocpRange: { readonly min: number; readonly max: number };
}

/**
 * Variant-specific capability profile for the Rigol DP900 PSU family.
 * Channel counts and per-channel limits are the main thing that changes
 * between models; pairing/tracking shape tracks with channel count.
 */
export interface Dp900Profile {
  readonly variant: string;
  readonly channels: readonly Dp900ChannelProfile[];
  /** CH pair that :OUTPut:PAIR can couple (empty → no pairing support). */
  readonly pairingChannels: readonly number[];
  /** CHs that participate in :OUTPut:TRACk (empty → tracking not offered). */
  readonly trackingChannels: readonly number[];
  readonly presetSlots: number;
}

// Protection headroom is ≈10% above the rated output per DP900 programming
// guide (table 4.33 for DP932E). The same ratio holds on sibling SKUs.
const PROTECTION_HEADROOM = 1.1;

function channel(
  id: number,
  voltageMax: number,
  currentMax: number,
): Dp900ChannelProfile {
  const ovpMax = Number((voltageMax * PROTECTION_HEADROOM).toFixed(3));
  const ocpMax = Number((currentMax * PROTECTION_HEADROOM).toFixed(3));
  return {
    id,
    voltageMax,
    currentMax,
    ovpRange: { min: 0.001, max: ovpMax },
    ocpRange: { min: 0.001, max: ocpMax },
  };
}

// Rigol DP900 SKUs we've confirmed ship today. The DP932U is the 3-channel
// USB-only SKU; DP932E is the LXI/LAN variant; DP912 is the mid-range
// 2-channel unit. Extending this is a one-line change.
export const DP900_VARIANTS: readonly Dp900Profile[] = [
  {
    variant: "DP932E",
    channels: [channel(1, 30, 3), channel(2, 30, 3), channel(3, 6, 3)],
    pairingChannels: [1, 2],
    trackingChannels: [1, 2],
    presetSlots: 10,
  },
  {
    variant: "DP932U",
    channels: [channel(1, 30, 3), channel(2, 30, 3), channel(3, 6, 3)],
    pairingChannels: [1, 2],
    trackingChannels: [1, 2],
    presetSlots: 10,
  },
  {
    variant: "DP912",
    channels: [channel(1, 30, 3), channel(2, 30, 3)],
    pairingChannels: [1, 2],
    trackingChannels: [1, 2],
    presetSlots: 10,
  },
];

/**
 * Catch-all profile: the 3-channel DP932E layout. Extra channels are the
 * common case, unknown SKUs are unlikely to have fewer.
 */
export const DP900_DEFAULT: Dp900Profile = {
  variant: "DP9xx",
  channels: [channel(1, 30, 3), channel(2, 30, 3), channel(3, 6, 3)],
  pairingChannels: [1, 2],
  trackingChannels: [1, 2],
  presetSlots: 10,
};

/**
 * Runtime refinement. DP900 units expose `:SYSTem:CHANnel:COUNt?` on newer
 * firmware; on older units we fall back to probing `:SOURce<N>:VOLTage?`.
 * Either way we only ever narrow the profile to channels the device
 * actually exposes — adding channels back isn't meaningful because the
 * limits are variant-specific.
 */
export async function refineDp900Profile(
  base: Dp900Profile,
  port: ScpiPort,
): Promise<Dp900Profile> {
  const reported = await queryChannelCount(port);
  const detected = reported ?? (await probeChannelCount(port, base.channels.length));
  if (detected >= base.channels.length) return base;
  return { ...base, channels: base.channels.slice(0, detected) };
}

async function queryChannelCount(port: ScpiPort): Promise<number | null> {
  try {
    const raw = await port.query(":SYSTem:CHANnel:COUNt?", { timeoutMs: 800 });
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function probeChannelCount(port: ScpiPort, upper: number): Promise<number> {
  let count = 0;
  for (let id = 1; id <= upper; id += 1) {
    try {
      const raw = await port.query(`:SOURce${id}:VOLTage?`, { timeoutMs: 400 });
      if (raw.trim().length === 0) break;
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n)) break;
      count = id;
    } catch {
      break;
    }
  }
  return Math.max(1, count);
}

// Re-exported so drivers can use the same parser without reaching into
// `_shared/` themselves — keeps imports in the family file tidy.
export { parseBool };
