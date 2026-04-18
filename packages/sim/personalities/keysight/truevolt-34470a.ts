import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { buildTrueVoltPersonality } from "./_shared/truevolt.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "truevolt-34470a.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight 34470A personality — 7½-digit Truevolt. Same SCPI surface
 * as the 34461A; the difference surfaces in the profile's display
 * digits and option set. The simulator shares the command table — the
 * IDN is what the driver keys off at resolve time.
 */
export const keysightTruevolt34470aPersonality: SimulatorPersonality = buildTrueVoltPersonality({
  id: "keysight-truevolt-34470a",
  idn: "Keysight Technologies,34470A,{serial},A.03.02-03.15-03.15-00.52-03-03",
  fixture,
});
