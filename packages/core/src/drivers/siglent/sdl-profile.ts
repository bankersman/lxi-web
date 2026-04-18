import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

export interface SdlProfile {
  readonly variant: string;
  readonly voltageMax: number;
  readonly currentMax: number;
  readonly powerMax: number;
  readonly resistanceRange: { readonly min: number; readonly max: number };
  readonly hasDynamic: boolean;
  readonly hasBattery: boolean;
  readonly hasList: boolean;
  readonly dynamicSlewMaxAPerUs: number;
  readonly presetSlots: number;
}

export const SDL_VARIANTS: readonly SdlProfile[] = [
  {
    variant: "SDL1020X-E",
    voltageMax: 150,
    currentMax: 30,
    powerMax: 200,
    resistanceRange: { min: 0.03, max: 15e3 },
    hasDynamic: true,
    hasBattery: true,
    hasList: false,
    dynamicSlewMaxAPerUs: 2.5,
    presetSlots: 8,
  },
  {
    variant: "SDL1020X",
    voltageMax: 150,
    currentMax: 30,
    powerMax: 200,
    resistanceRange: { min: 0.03, max: 15e3 },
    hasDynamic: true,
    hasBattery: true,
    hasList: true,
    dynamicSlewMaxAPerUs: 2.5,
    presetSlots: 8,
  },
  {
    variant: "SDL1030X-E",
    voltageMax: 150,
    currentMax: 30,
    powerMax: 300,
    resistanceRange: { min: 0.03, max: 15e3 },
    hasDynamic: true,
    hasBattery: true,
    hasList: false,
    dynamicSlewMaxAPerUs: 2.5,
    presetSlots: 8,
  },
  {
    variant: "SDL1030X",
    voltageMax: 150,
    currentMax: 30,
    powerMax: 300,
    resistanceRange: { min: 0.03, max: 15e3 },
    hasDynamic: true,
    hasBattery: true,
    hasList: true,
    dynamicSlewMaxAPerUs: 2.5,
    presetSlots: 8,
  },
];

export const SDL_DEFAULT: SdlProfile = {
  variant: "SDL10xxX",
  voltageMax: 150,
  currentMax: 30,
  powerMax: 200,
  resistanceRange: { min: 0.03, max: 15e3 },
  hasDynamic: true,
  hasBattery: true,
  hasList: false,
  dynamicSlewMaxAPerUs: 2.5,
  presetSlots: 8,
};

export async function refineSdlProfile(
  base: SdlProfile,
  port: ScpiPort,
): Promise<SdlProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
