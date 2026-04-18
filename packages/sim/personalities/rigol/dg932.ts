import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { makeDg9xxPersonality } from "./dg9xx-factory.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "dg932.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Rigol DG932 signal-generator personality. Two channels, 35 MHz sine
 * bandwidth. Shares the DG9xx handler tree with DG812.
 */
export const rigolDg932Personality: SimulatorPersonality = makeDg9xxPersonality({
  id: "rigol-dg932",
  idn: "RIGOL TECHNOLOGIES,DG932,{serial},00.02.00",
  fixture,
  frequencyMaxHz: 35_000_000,
  amplitudeMaxVpp: 20,
  channelCount: 2,
});
