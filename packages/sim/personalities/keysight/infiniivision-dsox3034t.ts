import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { buildInfiniiVisionPersonality } from "./_shared/infiniivision.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "infiniivision-dsox3034t.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight InfiniiVision DSOX3034T personality — 4-channel, 350 MHz
 * 3000T-series (capacitive touch). Same SCPI surface as DSOX2024A;
 * the driver picks up the higher sample-rate / memory-depth profile
 * off the IDN.
 */
export const keysightInfiniivisionDsox3034tPersonality: SimulatorPersonality =
  buildInfiniiVisionPersonality({
    id: "keysight-infiniivision-dsox3034t",
    idn: "Keysight Technologies,DSO-X 3034T,{serial},07.30.2020013000",
    fixture,
    channels: 4,
  });
