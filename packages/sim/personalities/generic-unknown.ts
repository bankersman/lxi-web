import type { SimulatorPersonality } from "../src/personality.js";

/**
 * A deliberately non-matching personality used to exercise the "connected
 * but no driver — raw SCPI only" path end-to-end. The manufacturer string
 * is not one the production registry knows about.
 */
export const genericUnknownPersonality: SimulatorPersonality = {
  id: "generic-unknown",
  kind: "unknown",
  idn: "ACME INSTRUMENTS,GENERIC-1000,{serial},1.0.0",
  opt: "",
  fixture: {
    responses: {
      "SYST:VERS?": "2023.0",
      "SYSTEM:VERSION?": "2023.0",
    },
  },
};
