import type { ScpiPort } from "../../scpi/port.js";
import { parseBool, queryOptList } from "./_shared/index.js";

export interface SpdChannelProfile {
  readonly id: number;
  readonly label: string;
  readonly voltageMax: number;
  readonly currentMax: number;
  readonly ovpRange: { readonly min: number; readonly max: number };
  readonly ocpRange: { readonly min: number; readonly max: number };
}

/**
 * Variant-specific capability profile for the Siglent SPD PSU family.
 * SPD covers both single-channel benches (SPD1168X / SPD1305X) and the
 * 3-channel SPD3303 series (CH3 is a fixed-selectable 2.5 / 3.3 / 5 V
 * rail on the X / C models, programmable within a narrow range).
 */
export interface SpdProfile {
  readonly variant: string;
  readonly channels: readonly SpdChannelProfile[];
  /**
   * Channels participating in the `OUTPut:TRACk` series / parallel
   * coupling. SPD3303 couples CH1 + CH2; single-channel variants have
   * no pairing (empty array).
   */
  readonly pairingChannels: readonly number[];
  /** Channels mirrored by tracking (single-setpoint drives both). */
  readonly trackingChannels: readonly number[];
  /**
   * `*SAV` / `*RCL` slot count. SPD3303 firmware exposes 5 user slots;
   * the single-channel SPDs expose 5 as well per the programming guide.
   */
  readonly presetSlots: number;
}

// SPD protection headroom: the programming guide documents OVP up to 1.1×
// the rated ceiling on SPD3303X / X-E; OCP top-end varies by SKU but
// always has at least 10% headroom.
const PROTECTION_HEADROOM = 1.1;

function channel(
  id: number,
  label: string,
  voltageMax: number,
  currentMax: number,
): SpdChannelProfile {
  return {
    id,
    label,
    voltageMax,
    currentMax,
    ovpRange: { min: 0.001, max: Number((voltageMax * PROTECTION_HEADROOM).toFixed(3)) },
    ocpRange: { min: 0.001, max: Number((currentMax * PROTECTION_HEADROOM).toFixed(3)) },
  };
}

export const SPD_VARIANTS: readonly SpdProfile[] = [
  {
    variant: "SPD1168X",
    channels: [channel(1, "CH1", 16, 8)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 5,
  },
  {
    variant: "SPD1305X",
    channels: [channel(1, "CH1", 30, 5)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 5,
  },
  {
    variant: "SPD3303X-E",
    channels: [
      channel(1, "CH1", 32, 3.2),
      channel(2, "CH2", 32, 3.2),
      channel(3, "CH3", 5, 3.2),
    ],
    pairingChannels: [1, 2],
    trackingChannels: [1, 2],
    presetSlots: 5,
  },
  {
    variant: "SPD3303X",
    channels: [
      channel(1, "CH1", 32, 3.2),
      channel(2, "CH2", 32, 3.2),
      channel(3, "CH3", 5, 3.2),
    ],
    pairingChannels: [1, 2],
    trackingChannels: [1, 2],
    presetSlots: 5,
  },
  {
    variant: "SPD3303C",
    channels: [
      channel(1, "CH1", 32, 3.2),
      channel(2, "CH2", 32, 3.2),
      channel(3, "CH3", 5, 3.2),
    ],
    pairingChannels: [1, 2],
    trackingChannels: [1, 2],
    presetSlots: 5,
  },
];

/** Conservative catch-all: 3-channel layout covers more surface area. */
export const SPD_DEFAULT: SpdProfile = {
  variant: "SPD3xxx",
  channels: [
    channel(1, "CH1", 32, 3.2),
    channel(2, "CH2", 32, 3.2),
    channel(3, "CH3", 5, 3.2),
  ],
  pairingChannels: [1, 2],
  trackingChannels: [1, 2],
  presetSlots: 5,
};

/**
 * SPD refinement: probe `*OPT?` for documented add-ons, then verify the
 * channel count with `SYSTem:CHANnel:COUNt?` when the firmware supports
 * it. Older SPD3303C firmware doesn't answer that query; we keep the
 * profile default in that case rather than guessing lower.
 */
export async function refineSpdProfile(
  base: SpdProfile,
  port: ScpiPort,
): Promise<SpdProfile> {
  const [options, detected] = await Promise.all([
    queryOptList(port),
    queryChannelCount(port),
  ]);
  void options;
  if (detected && detected < base.channels.length) {
    return { ...base, channels: base.channels.slice(0, detected) };
  }
  return base;
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

export { parseBool };
