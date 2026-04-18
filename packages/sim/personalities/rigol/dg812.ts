import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { makeDg9xxPersonality } from "./dg9xx-factory.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "dg812.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Rigol DG812 signal-generator personality. Two channels, 10 MHz sine
 * bandwidth. Round-trip state is covered by the shared DG9xx factory.
 */
export const rigolDg812Personality: SimulatorPersonality = makeDg9xxPersonality({
  id: "rigol-dg812",
  idn: "RIGOL TECHNOLOGIES,DG812,{serial},00.01.03",
  fixture,
  frequencyMaxHz: 10_000_000,
  amplitudeMaxVpp: 20,
  channelCount: 2,
});
