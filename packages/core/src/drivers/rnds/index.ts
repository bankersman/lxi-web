import { DriverRegistry } from "../../identity/registry.js";
import { RNDS_MANUFACTURER } from "./_shared/index.js";
import { RndsRtb } from "./rtb.js";
import {
  RTB_DEFAULT,
  RTB_VARIANTS,
  refineRtbProfile,
  type RtbProfile,
} from "./rtb-profile.js";
import { RndsNge } from "./nge.js";
import {
  NGE_DEFAULT,
  NGE_VARIANTS,
  refineNgeProfile,
  type NgeProfile,
} from "./nge-profile.js";
import { RndsHmc } from "./hmc.js";
import {
  HMC_DEFAULT,
  HMC_VARIANTS,
  refineHmcProfile,
  type HmcProfile,
} from "./hmc-profile.js";
import { RndsSma } from "./sma.js";
import {
  SMA_DEFAULT,
  SMA_VARIANTS,
  refineSmaProfile,
  type SmaProfile,
} from "./sma-profile.js";
import { RndsHmf } from "./hmf.js";
import {
  HMF_DEFAULT,
  HMF_VARIANTS,
  refineHmfProfile,
  type HmfProfile,
} from "./hmf-profile.js";
import { RndsFpc } from "./fpc.js";
import {
  FPC_DEFAULT,
  FPC_VARIANTS,
  refineFpcProfile,
  type FpcProfile,
} from "./fpc-profile.js";

export { RndsRtb } from "./rtb.js";
export { RndsNge } from "./nge.js";
export { RndsHmc } from "./hmc.js";
export { RndsSma } from "./sma.js";
export { RndsHmf } from "./hmf.js";
export { RndsFpc } from "./fpc.js";
export { RNDS_MANUFACTURER } from "./_shared/index.js";

export type {
  RtbProfile,
  NgeProfile,
  HmcProfile,
  SmaProfile,
  HmfProfile,
  FpcProfile,
};

export {
  RTB_VARIANTS,
  RTB_DEFAULT,
  refineRtbProfile,
  NGE_VARIANTS,
  NGE_DEFAULT,
  refineNgeProfile,
  HMC_VARIANTS,
  HMC_DEFAULT,
  refineHmcProfile,
  SMA_VARIANTS,
  SMA_DEFAULT,
  refineSmaProfile,
  HMF_VARIANTS,
  HMF_DEFAULT,
  refineHmfProfile,
  FPC_VARIANTS,
  FPC_DEFAULT,
  refineFpcProfile,
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
 * Register every Rohde & Schwarz driver. Per-SKU variants come first
 * (longest-name-first so e.g. MXO58 wins over MXO5), followed by
 * family-wide catch-alls that cover firmware revisions not listed in
 * the variant table.
 *
 * The manufacturer regex (`RNDS_MANUFACTURER`) matches both R&S and
 * the legacy HAMEG IDN strings, so Hameg-heritage SKUs (HMO / HMC /
 * HMS / HMF / HMP) are picked up automatically.
 */
export function registerRndsDrivers(registry: DriverRegistry): void {
  // ---- Oscilloscopes (RTB / RTM / RTA / MXO / HMO) ----
  for (const variant of sortedByLength(RTB_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `rnds-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: { manufacturer: RNDS_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new RndsRtb(port, identity, variant),
      refine: async (port) => {
        const refined = await refineRtbProfile(variant, port);
        return (p, i) => new RndsRtb(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rnds-rtb-family",
    kind: "oscilloscope",
    match: {
      manufacturer: RNDS_MANUFACTURER,
      model: /^(RTB|RTM|RTA|MXO|HMO)\d+/i,
    },
    create: (port, identity) => new RndsRtb(port, identity, RTB_DEFAULT),
    refine: async (port) => {
      const refined = await refineRtbProfile(RTB_DEFAULT, port);
      return (p, i) => new RndsRtb(p, i, refined);
    },
  });

  // ---- Power supplies (NGE / NGL / NGM / NGP / NGU / HMP / HMC) ----
  for (const variant of sortedByLength(NGE_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `rnds-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: { manufacturer: RNDS_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new RndsNge(port, identity, variant),
      refine: async (port) => {
        const refined = await refineNgeProfile(variant, port);
        return (p, i) => new RndsNge(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rnds-ngx-family",
    kind: "powerSupply",
    match: {
      manufacturer: RNDS_MANUFACTURER,
      // NGE / NGL / NGM / NGP / NGU + Hameg HMP power supplies.
      // HMC8043 is a PSU, HMC8012/8015 are DMMs, so we scope to NGx + HMP.
      model: /^(NGE|NGL|NGM|NGP|NGU|HMP)\d+/i,
    },
    create: (port, identity) => new RndsNge(port, identity, NGE_DEFAULT),
    refine: async (port) => {
      const refined = await refineNgeProfile(NGE_DEFAULT, port);
      return (p, i) => new RndsNge(p, i, refined);
    },
  });

  // ---- Multimeter (HMC8012 / HMC8015) ----
  for (const variant of HMC_VARIANTS) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `rnds-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: { manufacturer: RNDS_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new RndsHmc(port, identity, variant),
      refine: async (port) => {
        const refined = await refineHmcProfile(variant, port);
        return (p, i) => new RndsHmc(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rnds-hmc-dmm",
    kind: "multimeter",
    match: {
      manufacturer: RNDS_MANUFACTURER,
      // HMC801x covers the DMM SKUs (8012, 8015). HMC8041/42/43 are
      // function generators and route through the HMF driver instead.
      model: /^HMC801[25]\b/i,
    },
    create: (port, identity) => new RndsHmc(port, identity, HMC_DEFAULT),
    refine: async (port) => {
      const refined = await refineHmcProfile(HMC_DEFAULT, port);
      return (p, i) => new RndsHmc(p, i, refined);
    },
  });

  // ---- Signal generators (SMA / SMB / SMBV) ----
  for (const variant of sortedByLength(SMA_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `rnds-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: { manufacturer: RNDS_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new RndsSma(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSmaProfile(variant, port);
        return (p, i) => new RndsSma(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rnds-sma-family",
    kind: "signalGenerator",
    match: {
      manufacturer: RNDS_MANUFACTURER,
      model: /^(SMA|SMB|SMBV)\d{3}[A-Z]?/i,
    },
    create: (port, identity) => new RndsSma(port, identity, SMA_DEFAULT),
    refine: async (port) => {
      const refined = await refineSmaProfile(SMA_DEFAULT, port);
      return (p, i) => new RndsSma(p, i, refined);
    },
  });

  // ---- Function generators (HMF / HMC804x) ----
  for (const variant of sortedByLength(HMF_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `rnds-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: { manufacturer: RNDS_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new RndsHmf(port, identity, variant),
      refine: async (port) => {
        const refined = await refineHmfProfile(variant, port);
        return (p, i) => new RndsHmf(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rnds-hmf-family",
    kind: "signalGenerator",
    match: {
      manufacturer: RNDS_MANUFACTURER,
      model: /^HMF\d{4}/i,
    },
    create: (port, identity) => new RndsHmf(port, identity, HMF_DEFAULT),
    refine: async (port) => {
      const refined = await refineHmfProfile(HMF_DEFAULT, port);
      return (p, i) => new RndsHmf(p, i, refined);
    },
  });

  // ---- Spectrum analyzers (FPC / FPL / HMS) ----
  for (const variant of sortedByLength(FPC_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `rnds-${variant.variant.toLowerCase()}`,
      kind: "spectrumAnalyzer",
      match: { manufacturer: RNDS_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new RndsFpc(port, identity, variant),
      refine: async (port) => {
        const refined = await refineFpcProfile(variant, port);
        return (p, i) => new RndsFpc(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rnds-fpc-family",
    kind: "spectrumAnalyzer",
    match: {
      manufacturer: RNDS_MANUFACTURER,
      model: /^(FPC|FPL|HMS)\d+/i,
    },
    create: (port, identity) => new RndsFpc(port, identity, FPC_DEFAULT),
    refine: async (port) => {
      const refined = await refineFpcProfile(FPC_DEFAULT, port);
      return (p, i) => new RndsFpc(p, i, refined);
    },
  });
}
