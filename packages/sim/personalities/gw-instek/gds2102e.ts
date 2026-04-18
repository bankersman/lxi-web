import { gwInstekGds1054bPersonality } from "./gds1054b.js";
import type { SimulatorPersonality } from "../../src/personality.js";

/**
 * GW Instek GDS-2102E — mid-tier 2-channel 100 MHz scope.
 *
 * Inherits the handler surface from GDS-1054B; the real hardware
 * difference (serial decoders, larger memory depth) lives in the
 * driver profile, so the simulator only needs distinct IDN / model.
 */
export const gwInstekGds2102ePersonality: SimulatorPersonality = {
  ...gwInstekGds1054bPersonality,
  id: "gwinstek-gds2102e",
  idn: "GW Instek,GDS-2102E,{serial},V1.03",
};
