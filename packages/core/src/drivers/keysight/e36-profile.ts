import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

export interface E36ChannelProfile {
  readonly id: number;
  readonly label: string;
  readonly voltageMax: number;
  /** Some E36 channels support negative polarity (E36311A CH3 = -25 V / 1 A). */
  readonly voltageMin?: number;
  readonly currentMax: number;
  readonly ovpRange: { readonly min: number; readonly max: number };
  readonly ocpRange: { readonly min: number; readonly max: number };
}

/**
 * Variant-specific capability profile for the Keysight E36xxx / EDU36xxx
 * power-supply range.
 *
 * Profile fields follow the shape used by Siglent SPD and Rigol DP900
 * so the `IPowerSupply` surface is identical across vendors.
 *
 * Some E36300 pairs (e.g. E36311A / E36312A) support series and
 * parallel *pairing* between CH1 + CH2 — surfaced via `pairingChannels`.
 * Tracking (same setpoint drives both) is independent of pairing on
 * this family; we list the set of channels that can be coupled to the
 * master under `trackingChannels`.
 */
export interface E36Profile {
  readonly variant: string;
  readonly channels: readonly E36ChannelProfile[];
  readonly pairingChannels: readonly number[];
  readonly trackingChannels: readonly number[];
  readonly presetSlots: number;
  /**
   * Some E36100 firmwares don't support the channel-select
   * `INSTrument:SELect` form; the per-channel prefix `APPLy CHn` still
   * works universally, so we default to the prefix form and let legacy
   * entries override if needed. Kept as a `kind` tag so an eventual
   * E36100 driver split can carry its own parsing without a new facade.
   */
  readonly dialect: "edu" | "e36100" | "e36300" | "e364x";
}

const PROTECTION_HEADROOM = 1.1;

function channel(
  id: number,
  label: string,
  voltageMax: number,
  currentMax: number,
  voltageMin = 0,
): E36ChannelProfile {
  return {
    id,
    label,
    voltageMax,
    voltageMin,
    currentMax,
    ovpRange: { min: 0.001, max: Number((Math.abs(voltageMax) * PROTECTION_HEADROOM).toFixed(3)) },
    ocpRange: { min: 0.001, max: Number((currentMax * PROTECTION_HEADROOM).toFixed(3)) },
  };
}

export const E36_VARIANTS: readonly E36Profile[] = [
  // ---- EDU36xxx — education-tier triple output ----
  {
    variant: "EDU36311A",
    channels: [
      channel(1, "6 V / 5 A", 6, 5),
      channel(2, "+25 V / 1 A", 25, 1),
      channel(3, "-25 V / 1 A", -25, 1),
    ],
    pairingChannels: [2, 3],
    trackingChannels: [2, 3],
    presetSlots: 10,
    dialect: "edu",
  },
  // ---- E36100-series — single-output LXI ----
  {
    variant: "E36102A",
    channels: [channel(1, "6 V / 5 A", 6, 5)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 10,
    dialect: "e36100",
  },
  {
    variant: "E36103A",
    channels: [channel(1, "20 V / 2 A", 20, 2)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 10,
    dialect: "e36100",
  },
  {
    variant: "E36104A",
    channels: [channel(1, "35 V / 1 A", 35, 1)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 10,
    dialect: "e36100",
  },
  {
    variant: "E36105A",
    channels: [channel(1, "60 V / 0.6 A", 60, 0.6)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 10,
    dialect: "e36100",
  },
  {
    variant: "E36106A",
    channels: [channel(1, "100 V / 0.4 A", 100, 0.4)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 10,
    dialect: "e36100",
  },
  // ---- E36300-series — triple-output programmable ----
  {
    variant: "E36311A",
    channels: [
      channel(1, "6 V / 5 A", 6, 5),
      channel(2, "+25 V / 1 A", 25, 1),
      channel(3, "-25 V / 1 A", -25, 1),
    ],
    pairingChannels: [2, 3],
    trackingChannels: [2, 3],
    presetSlots: 10,
    dialect: "e36300",
  },
  {
    variant: "E36312A",
    channels: [
      channel(1, "6 V / 5 A", 6, 5),
      channel(2, "+25 V / 1 A", 25, 1),
      channel(3, "-25 V / 1 A", -25, 1),
    ],
    pairingChannels: [2, 3],
    trackingChannels: [2, 3],
    presetSlots: 10,
    dialect: "e36300",
  },
  {
    variant: "E36313A",
    channels: [
      channel(1, "6 V / 10 A", 6, 10),
      channel(2, "+25 V / 2 A", 25, 2),
      channel(3, "-25 V / 2 A", -25, 2),
    ],
    pairingChannels: [2, 3],
    trackingChannels: [2, 3],
    presetSlots: 10,
    dialect: "e36300",
  },
  // ---- Legacy Agilent E364xA — LXI-capable (via E-series I/O) ----
  {
    variant: "E3640A",
    channels: [channel(1, "8 V / 3 A", 8, 3)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 5,
    dialect: "e364x",
  },
  {
    variant: "E3641A",
    channels: [channel(1, "35 V / 0.8 A", 35, 0.8)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 5,
    dialect: "e364x",
  },
  {
    variant: "E3642A",
    channels: [channel(1, "20 V / 1.5 A", 20, 1.5)],
    pairingChannels: [],
    trackingChannels: [],
    presetSlots: 5,
    dialect: "e364x",
  },
];

/** Catch-all: mid-range triple-output E36300 pattern. */
export const E36_DEFAULT: E36Profile = {
  variant: "E36xxx",
  channels: [
    channel(1, "6 V / 5 A", 6, 5),
    channel(2, "+25 V / 1 A", 25, 1),
    channel(3, "-25 V / 1 A", -25, 1),
  ],
  pairingChannels: [2, 3],
  trackingChannels: [2, 3],
  presetSlots: 10,
  dialect: "e36300",
};

/**
 * E36 refinement: `*OPT?` surfaces firmware-version gated features
 * (for example `OVP:TRACK` requires firmware ≥ A.02). We probe the
 * option list but leave the base profile untouched for 4.7 — the
 * option tokens we'd act on (`TRACK`, `SEQ`, `DLOG`) are all soft
 * capabilities that would widen the facade beyond its 4.1 shape.
 * The hook stays live so later epics can tighten the profile without
 * touching the registry.
 */
export async function refineE36Profile(
  base: E36Profile,
  port: ScpiPort,
): Promise<E36Profile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
