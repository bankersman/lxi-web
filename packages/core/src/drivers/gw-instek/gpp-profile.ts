import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * GW Instek GPP / GPD / PSW profile.
 *
 * GPP (triple/quad linear) + GPD (economy linear) + PSW (programmable
 * switching) differ in capability surface but share the same channel
 * topology abstraction. The `family` field is what the driver uses to
 * select between capability surfaces (OVP/OCP presence, preset memory,
 * SCPI flavour).
 */
export type PsuFamily = "gpp" | "gpd" | "psw";

export interface PsuChannelProfile {
  readonly id: number;
  readonly label: string;
  readonly voltageMax: number;
  readonly currentMax: number;
}

export interface GpdProfile {
  readonly variant: string;
  readonly family: PsuFamily;
  readonly channels: readonly PsuChannelProfile[];
  readonly hasProtection: boolean;
  readonly hasPresets: boolean;
  readonly presetSlots: number;
}

export const GPP_VARIANTS: readonly GpdProfile[] = [
  // GPP linear PSUs — full capability surface.
  {
    variant: "GPP-1326",
    family: "gpp",
    channels: [
      { id: 1, label: "CH1", voltageMax: 32, currentMax: 6 },
    ],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
  {
    variant: "GPP-2323",
    family: "gpp",
    channels: [
      { id: 1, label: "CH1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "CH2", voltageMax: 32, currentMax: 3 },
    ],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
  {
    variant: "GPP-3323",
    family: "gpp",
    channels: [
      { id: 1, label: "CH1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "CH2", voltageMax: 32, currentMax: 3 },
      { id: 3, label: "CH3", voltageMax: 6, currentMax: 1 },
    ],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
  {
    variant: "GPP-4323",
    family: "gpp",
    channels: [
      { id: 1, label: "CH1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "CH2", voltageMax: 32, currentMax: 3 },
      { id: 3, label: "CH3", voltageMax: 6, currentMax: 1 },
      { id: 4, label: "CH4", voltageMax: 15, currentMax: 1 },
    ],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
  // GPD economy linear PSUs — NO protection, NO presets.
  {
    variant: "GPD-3303S",
    family: "gpd",
    channels: [
      { id: 1, label: "CH1", voltageMax: 30, currentMax: 3 },
      { id: 2, label: "CH2", voltageMax: 30, currentMax: 3 },
      { id: 3, label: "CH3", voltageMax: 5, currentMax: 3 },
    ],
    hasProtection: false,
    hasPresets: false,
    presetSlots: 0,
  },
  {
    variant: "GPD-4303S",
    family: "gpd",
    channels: [
      { id: 1, label: "CH1", voltageMax: 30, currentMax: 3 },
      { id: 2, label: "CH2", voltageMax: 30, currentMax: 3 },
      { id: 3, label: "CH3", voltageMax: 5, currentMax: 3 },
      { id: 4, label: "CH4", voltageMax: 15, currentMax: 1 },
    ],
    hasProtection: false,
    hasPresets: false,
    presetSlots: 0,
  },
  // PSW switching PSUs — single-channel, wide envelope, protection + presets.
  {
    variant: "PSW30-36",
    family: "psw",
    channels: [{ id: 1, label: "CH1", voltageMax: 30, currentMax: 36 }],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
  {
    variant: "PSW30-72",
    family: "psw",
    channels: [{ id: 1, label: "CH1", voltageMax: 30, currentMax: 72 }],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
  {
    variant: "PSW160-14.4",
    family: "psw",
    channels: [{ id: 1, label: "CH1", voltageMax: 160, currentMax: 14.4 }],
    hasProtection: true,
    hasPresets: true,
    presetSlots: 10,
  },
];

export const GPP_DEFAULT: GpdProfile = GPP_VARIANTS[0]!;

export async function refineGppProfile(
  base: GpdProfile,
  port: ScpiPort,
): Promise<GpdProfile> {
  const opts = await queryOptList(port);
  void opts;
  return base;
}
