import { buildXdmPersonality } from "./_shared/xdm.js";

/**
 * Owon XDM2041 — 5½-digit LXI bench DMM. The firmware advertises the
 * canonical `OWON` manufacturer prefix and supports 4-wire resistance
 * plus `*SAV` / `*RCL` preset slots; the personality exercises those
 * driver-promoted capabilities as its primary role.
 */
export const owonXdm2041Personality = buildXdmPersonality({
  id: "owon-xdm2041",
  idn: "OWON,XDM2041,{serial},V3.6.0",
  has4Wire: true,
  hasPresets: true,
});
