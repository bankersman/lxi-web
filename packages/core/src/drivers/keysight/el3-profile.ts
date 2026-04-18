import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant-specific profile for the Keysight EL3xxx electronic-load range.
 *
 * EL34143A — 1 ch / 150 V / 40 A / 350 W.
 * EL34243A — 2 ch / 150 V / 40 A / 300 W per channel.
 *
 * Both families share the same SCPI tree; channel count and per-channel
 * power ceiling are the only meaningful differences. Profile-driven
 * per 4.2 so the driver stays shared.
 */
export interface El3Profile {
  readonly variant: string;
  readonly channels: number;
  readonly voltageMax: number;
  readonly currentMax: number;
  readonly powerMax: number;
  readonly resistanceRange: { readonly min: number; readonly max: number };
}

export const EL3_VARIANTS: readonly El3Profile[] = [
  {
    variant: "EL34143A",
    channels: 1,
    voltageMax: 150,
    currentMax: 40,
    powerMax: 350,
    resistanceRange: { min: 0.05, max: 4000 },
  },
  {
    variant: "EL34243A",
    channels: 2,
    voltageMax: 150,
    currentMax: 40,
    powerMax: 300,
    resistanceRange: { min: 0.05, max: 4000 },
  },
];

export const EL3_DEFAULT: El3Profile = {
  variant: "EL3xxx",
  channels: 1,
  voltageMax: 150,
  currentMax: 40,
  powerMax: 350,
  resistanceRange: { min: 0.05, max: 4000 },
};

/**
 * EL3 refinement. `*OPT?` might surface `DLOG` for the data-logger
 * option but that widens the facade beyond 2.6c, so for 4.7 the hook
 * only *reads* options and returns the base profile. Left live for
 * later epics.
 */
export async function refineEl3Profile(
  base: El3Profile,
  port: ScpiPort,
): Promise<El3Profile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
