import { buildXdmPersonality } from "./_shared/xdm.js";

/**
 * Owon XDM1041 — 4½-digit LXI bench DMM. Deliberately constructed
 * with an **empty** manufacturer token (the leading comma before
 * `XDM1041`) to exercise the registry's model-only fallback path;
 * real XDM1041 firmware drops in the wild have been observed to ship
 * the manufacturer field blank.
 */
export const owonXdm1041Personality = buildXdmPersonality({
  id: "owon-xdm1041",
  idn: ",XDM1041,{serial},V2.0.4",
  has4Wire: false,
  hasPresets: false,
});
