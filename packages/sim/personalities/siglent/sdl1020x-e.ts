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
  readFileSync(resolve(here, "sdl1020x-e.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Placeholder Siglent SDL1020X-E personality. Reserves the IDN pattern so
 * 4.6 (Siglent vendor pack) can drop in a real driver and flesh out the
 * handlers without touching facade or UI wiring. For now, only `*IDN?` +
 * `*OPT?` work; any other command silently writes / echoes 0.
 */
export const siglentSdl1020xEPersonality: SimulatorPersonality = {
  id: "siglent-sdl1020x-e",
  kind: "electronicLoad",
  idn: "Siglent Technologies,SDL1020X-E,{serial},1.1.1.25",
  opt: "",
  fixture,
  exactHandlers: {
    // Minimum queries the dashboard will touch during connect. Real
    // implementation lands in 4.6.
    "SOURCE:INPUT:STATE?": (): CommandResult => ({ kind: "line", text: "0" }),
    "SOURCE:FUNCTION?": (): CommandResult => ({ kind: "line", text: "CURR" }),
    "MEASURE:VOLTAGE?": (): CommandResult => ({ kind: "line", text: "0.0" }),
    "MEASURE:CURRENT?": (): CommandResult => ({ kind: "line", text: "0.0" }),
    "MEASURE:POWER?": (): CommandResult => ({ kind: "line", text: "0.0" }),
    "MEASURE:RESISTANCE?": (): CommandResult => ({ kind: "line", text: "9999" }),
  },
};
