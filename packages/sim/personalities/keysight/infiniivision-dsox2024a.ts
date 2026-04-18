import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PersonalityFixture, SimulatorPersonality } from "../../src/personality.js";
import { buildInfiniiVisionPersonality } from "./_shared/infiniivision.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "infiniivision-dsox2024a.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight InfiniiVision DSOX2024A personality — 4-channel, 200 MHz
 * 2000X-series representative for the Keysight scope pack.
 */
export const keysightInfiniivisionDsox2024aPersonality: SimulatorPersonality =
  buildInfiniiVisionPersonality({
    id: "keysight-infiniivision-dsox2024a",
    idn: "Keysight Technologies,DSO-X 2024A,{serial},02.50.2016061200",
    fixture,
    channels: 4,
  });
