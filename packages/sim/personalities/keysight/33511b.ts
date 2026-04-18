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
  readFileSync(resolve(here, "33511b.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Placeholder Keysight 33511B (Trueform 20 MHz, 1 channel) personality.
 * Reserves the IDN pattern for the 4.7 Keysight / legacy-Agilent pack so
 * the driver can slot in later without churning sim plumbing.
 */
export const keysight33511bPersonality: SimulatorPersonality = {
  id: "keysight-33511b",
  kind: "signalGenerator",
  idn: "Keysight Technologies,33511B,{serial},A.02.03-3.15",
  opt: "",
  fixture,
  exactHandlers: {
    // The 33500B family answers `:OUTPut?` with `0` / `1`. That's enough to
    // keep a bare connection alive; the vendor pack in 4.7 will flesh the
    // rest of the tree out.
    "OUTPUT?": (): CommandResult => ({ kind: "line", text: "0" }),
    "SOURCE:FUNCTION?": (): CommandResult => ({ kind: "line", text: "SIN" }),
    "SOURCE:FREQUENCY?": (): CommandResult => ({ kind: "line", text: "1000" }),
    "SOURCE:VOLTAGE?": (): CommandResult => ({ kind: "line", text: "0.1" }),
    "SOURCE:VOLTAGE:OFFSET?": (): CommandResult => ({ kind: "line", text: "0" }),
  },
};
