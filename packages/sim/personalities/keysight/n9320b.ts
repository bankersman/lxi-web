import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  CommandResult,
  PersonalityFixture,
  SimulatorPersonality,
} from "../../src/personality.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "n9320b.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Placeholder Keysight N9320B personality. Reserves the IDN so the
 * Keysight vendor pack (4.7) can plug in a real SA driver without having
 * to rewire facades.
 */
export const keysightN9320bPersonality: SimulatorPersonality = {
  id: "keysight-n9320b",
  kind: "spectrumAnalyzer",
  idn: "Keysight Technologies,N9320B,{serial},A.01.07",
  opt: "",
  fixture,
  exactHandlers: {
    "SYSTEM:ERROR?": (): CommandResult => ({
      kind: "line",
      text: '+0,"No error"',
    }),
  },
};
