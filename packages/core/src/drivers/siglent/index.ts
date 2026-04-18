import { DriverRegistry } from "../../identity/registry.js";
import { SiglentSsa3000x } from "./ssa3000x.js";
import {
  SSA3000X_DEFAULT,
  SSA3000X_VARIANTS,
  refineSsa3000xProfile,
  type Ssa3000xProfile,
} from "./ssa3000x-profile.js";
import { SiglentSpd } from "./spd.js";
import {
  SPD_DEFAULT,
  SPD_VARIANTS,
  refineSpdProfile,
  type SpdProfile,
} from "./spd-profile.js";
import { SiglentSdm } from "./sdm.js";
import {
  SDM_DEFAULT,
  SDM_VARIANTS,
  refineSdmProfile,
  type SdmProfile,
} from "./sdm-profile.js";
import { SiglentSdsHd } from "./sds.js";
import {
  SDS_DEFAULT,
  SDS_VARIANTS,
  refineSdsProfile,
  type SdsProfile,
} from "./sds-profile.js";
import { SiglentSdl } from "./sdl.js";
import {
  SDL_DEFAULT,
  SDL_VARIANTS,
  refineSdlProfile,
  type SdlProfile,
} from "./sdl-profile.js";
import { SiglentSdg } from "./sdg.js";
import {
  SDG_DEFAULT,
  SDG_VARIANTS,
  refineSdgProfile,
  type SdgProfile,
} from "./sdg-profile.js";

export { SiglentSsa3000x } from "./ssa3000x.js";
export { SiglentSpd } from "./spd.js";
export { SiglentSdm } from "./sdm.js";
export { SiglentSdsHd } from "./sds.js";
export { SiglentSdl } from "./sdl.js";
export { SiglentSdg } from "./sdg.js";

export type { Ssa3000xProfile, SpdProfile, SdmProfile, SdsProfile, SdlProfile, SdgProfile };
export {
  SSA3000X_VARIANTS,
  SSA3000X_DEFAULT,
  SPD_VARIANTS,
  SPD_DEFAULT,
  SDM_VARIANTS,
  SDM_DEFAULT,
  SDS_VARIANTS,
  SDS_DEFAULT,
  SDL_VARIANTS,
  SDL_DEFAULT,
  SDG_VARIANTS,
  SDG_DEFAULT,
  refineSsa3000xProfile,
  refineSpdProfile,
  refineSdmProfile,
  refineSdsProfile,
  refineSdlProfile,
  refineSdgProfile,
};

/**
 * Register every Siglent driver this build ships with. Per-variant entries
 * for each family (SSA / SPD / SDM / SDS / SDL / SDG) plus a tolerant
 * catch-all regex per family. Manufacturer pattern accepts both
 * `Siglent` and `SIGLENT`; "Siglent Technologies Co., Ltd." is matched
 * by the same token via the shared `manufacturer: "siglent"` pattern.
 *
 * Variant regexes match the model prefix so firmware-suffixed IDNs
 * (e.g. `SDS1104X-E-X` on older firmware drops) still resolve.
 */
/**
 * Sort variants longest-name first. Needed because `^MODEL\b` regexes
 * can still match strict prefixes of longer SKUs (e.g. `^SPD3303X\b`
 * matches `SPD3303X-E` since `-` is a regex word boundary). By
 * registering the most specific variant first, the registry's
 * first-match-wins resolution picks the correct SKU.
 */
function sortedByLength<T extends { readonly variant: string }>(variants: readonly T[]): T[] {
  return [...variants].sort((a, b) => b.variant.length - a.variant.length);
}

export function registerSiglentDrivers(registry: DriverRegistry): void {
  // ---- SSA (spectrum analyzer) — anchored in 4.5 ----
  for (const variant of sortedByLength(SSA3000X_VARIANTS)) {
    registry.register({
      id: `siglent-${variant.variant.toLowerCase()}`,
      kind: "spectrumAnalyzer",
      match: {
        manufacturer: "siglent",
        model: new RegExp(`^${variant.variant}\\b`, "i"),
      },
      create: (port, identity) => new SiglentSsa3000x(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSsa3000xProfile(variant, port);
        return (p, i) => new SiglentSsa3000x(p, i, refined);
      },
    });
  }
  registry.register({
    id: "siglent-ssa3000x",
    kind: "spectrumAnalyzer",
    match: { manufacturer: "siglent", model: /^SSA3\d{3}X(?:-R)?/i },
    create: (port, identity) => new SiglentSsa3000x(port, identity, SSA3000X_DEFAULT),
    refine: async (port) => {
      const refined = await refineSsa3000xProfile(SSA3000X_DEFAULT, port);
      return (p, i) => new SiglentSsa3000x(p, i, refined);
    },
  });

  // ---- SPD (power supply) ----
  for (const variant of sortedByLength(SPD_VARIANTS)) {
    registry.register({
      id: `siglent-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: {
        manufacturer: "siglent",
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new SiglentSpd(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSpdProfile(variant, port);
        return (p, i) => new SiglentSpd(p, i, refined);
      },
    });
  }
  registry.register({
    id: "siglent-spd",
    kind: "powerSupply",
    match: { manufacturer: "siglent", model: /^SPD\d{4}/i },
    create: (port, identity) => new SiglentSpd(port, identity, SPD_DEFAULT),
    refine: async (port) => {
      const refined = await refineSpdProfile(SPD_DEFAULT, port);
      return (p, i) => new SiglentSpd(p, i, refined);
    },
  });

  // ---- SDM (multimeter) ----
  for (const variant of sortedByLength(SDM_VARIANTS)) {
    registry.register({
      id: `siglent-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: {
        manufacturer: "siglent",
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new SiglentSdm(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSdmProfile(variant, port);
        return (p, i) => new SiglentSdm(p, i, refined);
      },
    });
  }
  registry.register({
    id: "siglent-sdm",
    kind: "multimeter",
    match: { manufacturer: "siglent", model: /^SDM\d{4}/i },
    create: (port, identity) => new SiglentSdm(port, identity, SDM_DEFAULT),
    refine: async (port) => {
      const refined = await refineSdmProfile(SDM_DEFAULT, port);
      return (p, i) => new SiglentSdm(p, i, refined);
    },
  });

  // ---- SDS (oscilloscope) ----
  for (const variant of sortedByLength(SDS_VARIANTS)) {
    registry.register({
      id: `siglent-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: {
        manufacturer: "siglent",
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new SiglentSdsHd(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSdsProfile(variant, port);
        return (p, i) => new SiglentSdsHd(p, i, refined);
      },
    });
  }
  registry.register({
    id: "siglent-sds",
    kind: "oscilloscope",
    match: { manufacturer: "siglent", model: /^SDS\d{3,4}/i },
    create: (port, identity) => new SiglentSdsHd(port, identity, SDS_DEFAULT),
    refine: async (port) => {
      const refined = await refineSdsProfile(SDS_DEFAULT, port);
      return (p, i) => new SiglentSdsHd(p, i, refined);
    },
  });

  // ---- SDL (electronic load) ----
  for (const variant of sortedByLength(SDL_VARIANTS)) {
    registry.register({
      id: `siglent-${variant.variant.toLowerCase()}`,
      kind: "electronicLoad",
      match: {
        manufacturer: "siglent",
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new SiglentSdl(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSdlProfile(variant, port);
        return (p, i) => new SiglentSdl(p, i, refined);
      },
    });
  }
  registry.register({
    id: "siglent-sdl",
    kind: "electronicLoad",
    match: { manufacturer: "siglent", model: /^SDL\d{4}/i },
    create: (port, identity) => new SiglentSdl(port, identity, SDL_DEFAULT),
    refine: async (port) => {
      const refined = await refineSdlProfile(SDL_DEFAULT, port);
      return (p, i) => new SiglentSdl(p, i, refined);
    },
  });

  // ---- SDG (signal generator) ----
  for (const variant of sortedByLength(SDG_VARIANTS)) {
    registry.register({
      id: `siglent-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: {
        manufacturer: "siglent",
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new SiglentSdg(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSdgProfile(variant, port);
        return (p, i) => new SiglentSdg(p, i, refined);
      },
    });
  }
  registry.register({
    id: "siglent-sdg",
    kind: "signalGenerator",
    match: { manufacturer: "siglent", model: /^SDG\d{4}/i },
    create: (port, identity) => new SiglentSdg(port, identity, SDG_DEFAULT),
    refine: async (port) => {
      const refined = await refineSdgProfile(SDG_DEFAULT, port);
      return (p, i) => new SiglentSdg(p, i, refined);
    },
  });
}

/**
 * Escape regex metacharacters in a variant name so `SDM3065X-SC`'s
 * hyphen is matched literally. Variant names may include dots, dashes,
 * and plus signs; we keep letters, digits, `X`, `-` and `+` unescaped
 * in the lookahead and escape everything else.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
