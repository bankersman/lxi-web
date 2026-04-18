import { DriverRegistry } from "../../identity/registry.js";
import { GwInstekGds } from "./gds.js";
import {
  GDS_DEFAULT,
  GDS_VARIANTS,
  refineGdsProfile,
  type GdsProfile,
} from "./gds-profile.js";
import { GwInstekGpp } from "./gpp.js";
import {
  GPP_DEFAULT,
  GPP_VARIANTS,
  refineGppProfile,
  type GpdProfile,
  type PsuChannelProfile,
  type PsuFamily,
} from "./gpp-profile.js";
import { GwInstekGdm } from "./gdm.js";
import {
  GDM_DEFAULT,
  GDM_VARIANTS,
  refineGdmProfile,
  type GdmProfile,
} from "./gdm-profile.js";
import { GwInstekAfg } from "./afg.js";
import {
  AFG_DEFAULT as GW_AFG_DEFAULT,
  AFG_VARIANTS as GW_AFG_VARIANTS,
  refineAfgProfile as refineGwAfgProfile,
  type AfgProfile as GwAfgProfile,
} from "./afg-profile.js";
import { GwInstekGsp } from "./gsp.js";
import {
  GSP_DEFAULT,
  GSP_VARIANTS,
  refineGspProfile,
  type GspProfile,
} from "./gsp-profile.js";
import { GWINSTEK_MANUFACTURER } from "./_shared/index.js";

export { GwInstekGds, GwInstekGpp, GwInstekGdm, GwInstekAfg, GwInstekGsp };
export type {
  GdsProfile,
  GpdProfile,
  PsuChannelProfile,
  PsuFamily,
  GdmProfile,
  GwAfgProfile,
  GspProfile,
};
export {
  GDS_VARIANTS,
  GDS_DEFAULT,
  GPP_VARIANTS,
  GPP_DEFAULT,
  GDM_VARIANTS,
  GDM_DEFAULT,
  GW_AFG_VARIANTS,
  GW_AFG_DEFAULT,
  GSP_VARIANTS,
  GSP_DEFAULT,
  refineGdsProfile,
  refineGppProfile,
  refineGdmProfile,
  refineGwAfgProfile,
  refineGspProfile,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortedByLength<T extends { readonly variant: string }>(
  variants: readonly T[],
): T[] {
  return [...variants].sort((a, b) => b.variant.length - a.variant.length);
}

/**
 * Register every GW Instek driver this build ships with.
 *
 * Catch-all patterns (conservative — GW's SCPI conformance is uneven,
 * so we keep defaults narrow and rely on the per-variant entries for
 * full capability exposure):
 *   - GDS/MSO/MDO/MPO: `(GDS|MSO|MDO|MPO)-?\d{3,4}[A-Z]?`
 *   - GPP/GPD/PSW:     `(GPP|GPD|PSW)-?[\d.-]+[A-Z]?`
 *   - GDM:             `GDM-?\d{4}[A-Z]?`
 *   - AFG/MFG:         `(AFG|MFG)-?\d{3,4}[A-Z]?`
 *   - GSP:             `GSP-?\d{3,4}[A-Z]?`
 */
export function registerGwInstekDrivers(registry: DriverRegistry): void {
  // ---- GDS / MSO / MDO oscilloscopes ----
  for (const variant of sortedByLength(GDS_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `gwinstek-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: { manufacturer: GWINSTEK_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new GwInstekGds(port, identity, variant),
      refine: async (port) => {
        const refined = await refineGdsProfile(variant, port);
        return (p, i) => new GwInstekGds(p, i, refined);
      },
    });
  }
  registry.register({
    id: "gwinstek-gds",
    kind: "oscilloscope",
    match: {
      manufacturer: GWINSTEK_MANUFACTURER,
      model: /^(GDS|MSO|MDO|MPO)-?\d{3,4}[A-Z]?/i,
    },
    create: (port, identity) => new GwInstekGds(port, identity, GDS_DEFAULT),
    refine: async (port) => {
      const refined = await refineGdsProfile(GDS_DEFAULT, port);
      return (p, i) => new GwInstekGds(p, i, refined);
    },
  });

  // ---- GPP / GPD / PSW power supplies ----
  for (const variant of sortedByLength(GPP_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `gwinstek-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: { manufacturer: GWINSTEK_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new GwInstekGpp(port, identity, variant),
      refine: async (port) => {
        const refined = await refineGppProfile(variant, port);
        return (p, i) => new GwInstekGpp(p, i, refined);
      },
    });
  }
  registry.register({
    id: "gwinstek-gpp",
    kind: "powerSupply",
    match: {
      manufacturer: GWINSTEK_MANUFACTURER,
      model: /^(GPP|GPD|PSW)[\s-]?[\d.\-]+/i,
    },
    create: (port, identity) => new GwInstekGpp(port, identity, GPP_DEFAULT),
    refine: async (port) => {
      const refined = await refineGppProfile(GPP_DEFAULT, port);
      return (p, i) => new GwInstekGpp(p, i, refined);
    },
  });

  // ---- GDM multimeters ----
  for (const variant of sortedByLength(GDM_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `gwinstek-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: { manufacturer: GWINSTEK_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new GwInstekGdm(port, identity, variant),
      refine: async (port) => {
        const refined = await refineGdmProfile(variant, port);
        return (p, i) => new GwInstekGdm(p, i, refined);
      },
    });
  }
  registry.register({
    id: "gwinstek-gdm",
    kind: "multimeter",
    match: { manufacturer: GWINSTEK_MANUFACTURER, model: /^GDM-?\d{4}[A-Z]?/i },
    create: (port, identity) => new GwInstekGdm(port, identity, GDM_DEFAULT),
    refine: async (port) => {
      const refined = await refineGdmProfile(GDM_DEFAULT, port);
      return (p, i) => new GwInstekGdm(p, i, refined);
    },
  });

  // ---- AFG / MFG signal generators ----
  for (const variant of sortedByLength(GW_AFG_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `gwinstek-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: { manufacturer: GWINSTEK_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new GwInstekAfg(port, identity, variant),
      refine: async (port) => {
        const refined = await refineGwAfgProfile(variant, port);
        return (p, i) => new GwInstekAfg(p, i, refined);
      },
    });
  }
  registry.register({
    id: "gwinstek-afg",
    kind: "signalGenerator",
    match: {
      manufacturer: GWINSTEK_MANUFACTURER,
      model: /^(AFG|MFG)-?\d{3,4}[A-Z]?/i,
    },
    create: (port, identity) => new GwInstekAfg(port, identity, GW_AFG_DEFAULT),
    refine: async (port) => {
      const refined = await refineGwAfgProfile(GW_AFG_DEFAULT, port);
      return (p, i) => new GwInstekAfg(p, i, refined);
    },
  });

  // ---- GSP spectrum analyzers ----
  for (const variant of sortedByLength(GSP_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `gwinstek-${variant.variant.toLowerCase()}`,
      kind: "spectrumAnalyzer",
      match: { manufacturer: GWINSTEK_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new GwInstekGsp(port, identity, variant),
      refine: async (port) => {
        const refined = await refineGspProfile(variant, port);
        return (p, i) => new GwInstekGsp(p, i, refined);
      },
    });
  }
  registry.register({
    id: "gwinstek-gsp",
    kind: "spectrumAnalyzer",
    match: { manufacturer: GWINSTEK_MANUFACTURER, model: /^GSP-?\d{3,4}[A-Z]?/i },
    create: (port, identity) => new GwInstekGsp(port, identity, GSP_DEFAULT),
    refine: async (port) => {
      const refined = await refineGspProfile(GSP_DEFAULT, port);
      return (p, i) => new GwInstekGsp(p, i, refined);
    },
  });
}
