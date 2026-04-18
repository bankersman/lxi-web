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
  readFileSync(resolve(here, "rsa3030.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Placeholder Rigol RSA3030 personality. Reserves the IDN pattern so a
 * follow-up step can drop in a real driver + trace generator without
 * touching 4.5's facade wiring. Currently only `*IDN?` + `*OPT?` answer
 * meaningfully; everything else echoes 0.
 */
export const rigolRsa3030Personality: SimulatorPersonality = {
  id: "rigol-rsa3030",
  kind: "spectrumAnalyzer",
  idn: "RIGOL TECHNOLOGIES,RSA3030,{serial},01.00.01.00.00",
  opt: "",
  fixture,
  exactHandlers: {
    "SYSTEM:ERROR?": (): CommandResult => ({
      kind: "line",
      text: '+0,"No error"',
    }),
  },
};
