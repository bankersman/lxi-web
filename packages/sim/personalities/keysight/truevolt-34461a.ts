import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { buildTrueVoltPersonality } from "./_shared/truevolt.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "truevolt-34461a.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight 34461A personality — 6½-digit Truevolt DMM. The Truevolt
 * SCPI dialect is shared across 34450A / 34461A / 34465A / 34470A; the
 * 34461A is the first-tier Truevolt that gets all the dual-display +
 * temperature transducer knobs, so it's a good anchor.
 */
export const keysightTruevolt34461aPersonality: SimulatorPersonality = buildTrueVoltPersonality({
  id: "keysight-truevolt-34461a",
  idn: "Keysight Technologies,34461A,{serial},A.03.01-03.15-03.15-00.52-03-03",
  fixture,
});
