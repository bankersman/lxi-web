import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Fluke multi-function calibrator profile.
 *
 * Covers the 5500/5520 and 5700/5730 reference calibrators. These are
 * not true power supplies — they source V / I / R / C / F / Z with
 * very tight accuracy and report a set of compliance / standby /
 * operate states. We expose them through the `IPowerSupply` façade as
 * a *narrow* instrument: single output channel, voltage + current
 * setpoints, OUTPut ON/OFF (mapped to OPERate), and no protection /
 * preset surface. Artefact-calibration workflows stay firmly out of
 * scope.
 *
 * Capability gating is driven by this profile, and the registry
 * instantiates `FlukeCalibrator` for recognised SKUs.
 */
export interface FlukeCalibratorProfile {
  readonly variant: string;
  readonly voltageMaxDc: number;
  readonly voltageMaxAc: number;
  readonly currentMaxDc: number;
  readonly currentMaxAc: number;
  /** `true` when the calibrator also sources frequency (5520A / 5730A). */
  readonly hasFrequency: boolean;
  /** `true` when the calibrator exposes an auxiliary current output. */
  readonly hasAuxChannel: boolean;
  /** Needs CR+LF termination like the bench DMMs. */
  readonly needsCrlf: boolean;
}

export const CALIBRATOR_VARIANTS: readonly FlukeCalibratorProfile[] = [
  {
    variant: "5520A",
    voltageMaxDc: 1020,
    voltageMaxAc: 1020,
    currentMaxDc: 20,
    currentMaxAc: 20,
    hasFrequency: true,
    hasAuxChannel: true,
    needsCrlf: true,
  },
  {
    variant: "5522A",
    voltageMaxDc: 1020,
    voltageMaxAc: 1020,
    currentMaxDc: 20,
    currentMaxAc: 20,
    hasFrequency: true,
    hasAuxChannel: true,
    needsCrlf: true,
  },
  {
    variant: "5730A",
    voltageMaxDc: 1100,
    voltageMaxAc: 1100,
    currentMaxDc: 2.2,
    currentMaxAc: 2.2,
    hasFrequency: true,
    hasAuxChannel: false,
    needsCrlf: true,
  },
];

export const CALIBRATOR_DEFAULT: FlukeCalibratorProfile = CALIBRATOR_VARIANTS[0]!;

/**
 * `*OPT?` on Fluke calibrators returns feature codes like
 * `SC600`, `GHZ`, `LC`. We don't differentiate on the advertised
 * list today; the hook exists so later work can widen the DC voltage
 * range for the `SC1100` option on the 5520A.
 */
export async function refineCalibratorProfile(
  base: FlukeCalibratorProfile,
  port: ScpiPort,
): Promise<FlukeCalibratorProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
