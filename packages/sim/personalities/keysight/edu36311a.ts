import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { buildE36Personality } from "./_shared/e36.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "edu36311a.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight EDU36311A personality — education-tier triple output.
 * CH1: 6 V / 5 A, CH2: +25 V / 1 A, CH3: -25 V / 1 A. The SCPI surface
 * is identical to the E36300 programmable family so the handler set is
 * shared; the variant difference is per-channel maxes + IDN.
 */
export const keysightEdu36311aPersonality: SimulatorPersonality = buildE36Personality({
  id: "keysight-edu36311a",
  idn: "Keysight Technologies,EDU36311A,{serial},1.0.2-1.02",
  fixture,
  channels: [
    { id: 1, voltageMax: 6, currentMax: 5 },
    { id: 2, voltageMax: 25, currentMax: 1 },
    { id: 3, voltageMax: 25, currentMax: 1 },
  ],
  supportsPairing: true,
});
