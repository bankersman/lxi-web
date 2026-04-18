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
  readFileSync(resolve(here, "sdg2042x.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Placeholder Siglent SDG2042X personality. Reserves the IDN pattern for the
 * 4.6 Siglent vendor pack so the matching driver can land without
 * changing sim plumbing. Only a small handful of queries are wired — enough
 * that the dashboard's identity probe resolves to an `unknown` kind today.
 */
export const siglentSdg2042xPersonality: SimulatorPersonality = {
  id: "siglent-sdg2042x",
  kind: "signalGenerator",
  idn: "Siglent Technologies,SDG2042X,{serial},2.01.01.35",
  opt: "",
  fixture,
  exactHandlers: {
    "C1:OUTP?": (): CommandResult => ({ kind: "line", text: "C1:OUTP OFF" }),
    "C2:OUTP?": (): CommandResult => ({ kind: "line", text: "C2:OUTP OFF" }),
  },
};
