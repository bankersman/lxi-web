import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { buildE36Personality } from "./_shared/e36.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "e36313a.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight E36313A personality — higher-current triple-output E36300.
 * CH1: 6 V / 10 A, CH2: +25 V / 2 A, CH3: -25 V / 2 A. Same SCPI
 * surface as EDU36311A; the difference is per-channel max + IDN.
 */
export const keysightE36313aPersonality: SimulatorPersonality = buildE36Personality({
  id: "keysight-e36313a",
  idn: "Keysight Technologies,E36313A,{serial},3.0.2-2.00",
  fixture,
  channels: [
    { id: 1, voltageMax: 6, currentMax: 10 },
    { id: 2, voltageMax: 25, currentMax: 2 },
    { id: 3, voltageMax: 25, currentMax: 2 },
  ],
  supportsPairing: true,
});
