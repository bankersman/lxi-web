import { DriverRegistry } from "../../identity/registry.js";
import { TektronixTbs } from "./tbs.js";
import {
  TBS_DEFAULT,
  TBS_VARIANTS,
  refineTbsProfile,
  type TbsProfile,
} from "./tbs-profile.js";
import { TektronixMso } from "./mso.js";
import {
  MSO_DEFAULT,
  MSO_VARIANTS,
  refineMsoProfile,
  type MsoProfile,
} from "./mso-profile.js";
import { TektronixAfg } from "./afg.js";
import {
  AFG_DEFAULT,
  AFG_VARIANTS,
  refineAfgProfile,
  type AfgProfile,
} from "./afg-profile.js";
import { TektronixPws } from "./pws.js";
import {
  PWS_DEFAULT,
  PWS_VARIANTS,
  refinePwsProfile,
  type PwsProfile,
} from "./pws-profile.js";

export { TektronixTbs } from "./tbs.js";
export { TektronixMso } from "./mso.js";
export { TektronixAfg } from "./afg.js";
export { TektronixPws } from "./pws.js";

export type { TbsProfile, MsoProfile, AfgProfile, PwsProfile };
export {
  TBS_VARIANTS,
  TBS_DEFAULT,
  MSO_VARIANTS,
  MSO_DEFAULT,
  AFG_VARIANTS,
  AFG_DEFAULT,
  PWS_VARIANTS,
  PWS_DEFAULT,
  refineTbsProfile,
  refineMsoProfile,
  refineAfgProfile,
  refinePwsProfile,
};

/**
 * Tektronix IDN tends to use `TEKTRONIX` or `Tektronix`; a single
 * case-insensitive match is enough. No parent-company aliases to worry
 * about on this vendor.
 */
const TEKTRONIX_MANUFACTURER = /tektronix/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortedByLength<T extends { readonly variant: string }>(
  variants: readonly T[],
): T[] {
  return [...variants].sort((a, b) => b.variant.length - a.variant.length);
}

/**
 * Register every Tektronix driver this build ships with. Per-SKU entries
 * first (longest-name-first so specific variants win over broader
 * prefixes), followed by conservative family catch-alls.
 *
 * Catch-all patterns:
 *   - TBS:  `TBS(1|2)\d{3}[A-Z]?`
 *   - MSO:  `(MSO|DPO|MDO)\d{2,4}[A-Z]?`
 *   - AFG:  `AFG\d{4,5}[A-Z]?`
 *   - PWS:  `PWS\d{4}`
 */
export function registerTektronixDrivers(registry: DriverRegistry): void {
  // ---- TBS (oscilloscope — entry 2-/4-channel) ----
  for (const variant of sortedByLength(TBS_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `tektronix-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: { manufacturer: TEKTRONIX_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new TektronixTbs(port, identity, variant),
      refine: async (port) => {
        const refined = await refineTbsProfile(variant, port);
        return (p, i) => new TektronixTbs(p, i, refined);
      },
    });
  }
  registry.register({
    id: "tektronix-tbs",
    kind: "oscilloscope",
    match: { manufacturer: TEKTRONIX_MANUFACTURER, model: /^TBS[12]\d{3}[A-Z]?/i },
    create: (port, identity) => new TektronixTbs(port, identity, TBS_DEFAULT),
    refine: async (port) => {
      const refined = await refineTbsProfile(TBS_DEFAULT, port);
      return (p, i) => new TektronixTbs(p, i, refined);
    },
  });

  // ---- MSO / DPO / MDO (mid + flagship scopes) ----
  for (const variant of sortedByLength(MSO_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `tektronix-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: { manufacturer: TEKTRONIX_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new TektronixMso(port, identity, variant),
      refine: async (port) => {
        const refined = await refineMsoProfile(variant, port);
        return (p, i) => new TektronixMso(p, i, refined);
      },
    });
  }
  registry.register({
    id: "tektronix-mso",
    kind: "oscilloscope",
    match: { manufacturer: TEKTRONIX_MANUFACTURER, model: /^(MSO|DPO|MDO)\d{2,4}[A-Z]?/i },
    create: (port, identity) => new TektronixMso(port, identity, MSO_DEFAULT),
    refine: async (port) => {
      const refined = await refineMsoProfile(MSO_DEFAULT, port);
      return (p, i) => new TektronixMso(p, i, refined);
    },
  });

  // ---- AFG (signal / arbitrary generators) ----
  for (const variant of sortedByLength(AFG_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `tektronix-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: { manufacturer: TEKTRONIX_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new TektronixAfg(port, identity, variant),
      refine: async (port) => {
        const refined = await refineAfgProfile(variant, port);
        return (p, i) => new TektronixAfg(p, i, refined);
      },
    });
  }
  registry.register({
    id: "tektronix-afg",
    kind: "signalGenerator",
    match: { manufacturer: TEKTRONIX_MANUFACTURER, model: /^AFG\d{4,5}[A-Z]?/i },
    create: (port, identity) => new TektronixAfg(port, identity, AFG_DEFAULT),
    refine: async (port) => {
      const refined = await refineAfgProfile(AFG_DEFAULT, port);
      return (p, i) => new TektronixAfg(p, i, refined);
    },
  });

  // ---- PWS (power supplies) ----
  for (const variant of sortedByLength(PWS_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `tektronix-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: { manufacturer: TEKTRONIX_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new TektronixPws(port, identity, variant),
      refine: async (port) => {
        const refined = await refinePwsProfile(variant, port);
        return (p, i) => new TektronixPws(p, i, refined);
      },
    });
  }
  registry.register({
    id: "tektronix-pws",
    kind: "powerSupply",
    match: { manufacturer: TEKTRONIX_MANUFACTURER, model: /^PWS\d{4}/i },
    create: (port, identity) => new TektronixPws(port, identity, PWS_DEFAULT),
    refine: async (port) => {
      const refined = await refinePwsProfile(PWS_DEFAULT, port);
      return (p, i) => new TektronixPws(p, i, refined);
    },
  });
}
