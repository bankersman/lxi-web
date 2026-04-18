import { DriverRegistry } from "../../identity/registry.js";
import { OwonXdm } from "./xdm.js";
import {
  XDM_DEFAULT,
  XDM_VARIANTS,
  refineXdmProfile,
  type XdmProfile,
} from "./xdm-profile.js";
import { OwonSpe } from "./spe.js";
import {
  SPE_DEFAULT,
  SPE_VARIANTS,
  refineSpeProfile,
  type SpeProfile,
} from "./spe-profile.js";
import { OwonXds } from "./xds.js";
import {
  XDS_DEFAULT,
  XDS_VARIANTS,
  refineXdsProfile,
  type XdsProfile,
} from "./xds-profile.js";

export { OwonXdm } from "./xdm.js";
export { OwonSpe } from "./spe.js";
export { OwonXds } from "./xds.js";

export type { XdmProfile, SpeProfile, XdsProfile };
export {
  XDM_VARIANTS,
  XDM_DEFAULT,
  SPE_VARIANTS,
  SPE_DEFAULT,
  XDS_VARIANTS,
  XDS_DEFAULT,
  refineXdmProfile,
  refineSpeProfile,
  refineXdsProfile,
};

/**
 * Manufacturer regex covering every Owon-era IDN we've seen in the
 * wild:
 *
 *   - `OWON` / `Owon` / `owon` — modern firmware (XDM2041, XDS3000).
 *   - `Owon Technologies` — occasional marketing-branded firmware.
 *   - `Lilliput` — Owon's parent company; some early XDS firmwares
 *     ship with the parent name in the IDN manufacturer slot.
 *
 * We deliberately do not match the empty-manufacturer fallback
 * (some Owon firmwares leave the field blank); the registry supports
 * that case via a dedicated model-only registration per family.
 */
const OWON_MANUFACTURER = /owon|owon technologies|lilliput/i;

/**
 * Default SCPI port Owon benches listen on. Unlike Rigol / Siglent /
 * Keysight (5025), Owon ships with port **3000** enabled and rarely
 * exposes the 5025 alias. The "Add device" dialog uses this hint to
 * pre-fill the port field when a user picks an Owon driver.
 */
const OWON_DEFAULT_PORT = 3000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortedByLength<T extends { readonly variant: string }>(
  variants: readonly T[],
): T[] {
  return [...variants].sort((a, b) => b.variant.length - a.variant.length);
}

/**
 * Register every Owon driver this build ships with. Per-variant entries
 * for each family (XDM / SPE / XDS) plus a tolerant catch-all regex.
 * The manufacturer regex accepts `Owon`, `Owon Technologies`, and
 * `Lilliput` case-insensitively.
 *
 * We additionally register **model-only** fallback entries for each
 * family so instruments that advertise a blank manufacturer in their
 * `*IDN?` (observed on early XDM2041 firmware drops) still resolve.
 * The model patterns are narrow enough that Rigol / Siglent / Keysight
 * SKUs are not at risk of colliding — none of them ship with an
 * `XDM`, `SPE`, or `XDS` prefix.
 */
export function registerOwonDrivers(registry: DriverRegistry): void {
  // ---- XDM (multimeter) ----
  for (const variant of sortedByLength(XDM_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `owon-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: { manufacturer: OWON_MANUFACTURER, model: modelPattern },
      defaultPort: OWON_DEFAULT_PORT,
      create: (port, identity) => new OwonXdm(port, identity, variant),
      refine: async (port) => {
        const refined = await refineXdmProfile(variant, port);
        return (p, i) => new OwonXdm(p, i, refined);
      },
    });
  }
  registry.register({
    id: "owon-xdm",
    kind: "multimeter",
    match: { manufacturer: OWON_MANUFACTURER, model: /^XDM\d{4}/i },
    defaultPort: OWON_DEFAULT_PORT,
    create: (port, identity) => new OwonXdm(port, identity, XDM_DEFAULT),
    refine: async (port) => {
      const refined = await refineXdmProfile(XDM_DEFAULT, port);
      return (p, i) => new OwonXdm(p, i, refined);
    },
  });
  // Empty-manufacturer fallback: some XDM firmwares leave the manufacturer
  // field blank. Model prefix is distinctive enough to route on its own.
  registry.register({
    id: "owon-xdm-model-only",
    kind: "multimeter",
    match: { manufacturer: /^$/, model: /^XDM\d{4}/i },
    defaultPort: OWON_DEFAULT_PORT,
    create: (port, identity) => new OwonXdm(port, identity, XDM_DEFAULT),
    refine: async (port) => {
      const refined = await refineXdmProfile(XDM_DEFAULT, port);
      return (p, i) => new OwonXdm(p, i, refined);
    },
  });

  // ---- SPE (power supply) ----
  for (const variant of sortedByLength(SPE_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `owon-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: { manufacturer: OWON_MANUFACTURER, model: modelPattern },
      defaultPort: OWON_DEFAULT_PORT,
      create: (port, identity) => new OwonSpe(port, identity, variant),
      refine: async (port) => {
        const refined = await refineSpeProfile(variant, port);
        return (p, i) => new OwonSpe(p, i, refined);
      },
    });
  }
  registry.register({
    id: "owon-spe",
    kind: "powerSupply",
    match: { manufacturer: OWON_MANUFACTURER, model: /^SPE\d{4}/i },
    defaultPort: OWON_DEFAULT_PORT,
    create: (port, identity) => new OwonSpe(port, identity, SPE_DEFAULT),
    refine: async (port) => {
      const refined = await refineSpeProfile(SPE_DEFAULT, port);
      return (p, i) => new OwonSpe(p, i, refined);
    },
  });
  registry.register({
    id: "owon-spe-model-only",
    kind: "powerSupply",
    match: { manufacturer: /^$/, model: /^SPE\d{4}/i },
    defaultPort: OWON_DEFAULT_PORT,
    create: (port, identity) => new OwonSpe(port, identity, SPE_DEFAULT),
    refine: async (port) => {
      const refined = await refineSpeProfile(SPE_DEFAULT, port);
      return (p, i) => new OwonSpe(p, i, refined);
    },
  });

  // ---- XDS (oscilloscope) ----
  for (const variant of sortedByLength(XDS_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `owon-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: { manufacturer: OWON_MANUFACTURER, model: modelPattern },
      defaultPort: OWON_DEFAULT_PORT,
      create: (port, identity) => new OwonXds(port, identity, variant),
      refine: async (port) => {
        const refined = await refineXdsProfile(variant, port);
        return (p, i) => new OwonXds(p, i, refined);
      },
    });
  }
  registry.register({
    id: "owon-xds",
    kind: "oscilloscope",
    match: { manufacturer: OWON_MANUFACTURER, model: /^XDS\d{3,4}/i },
    defaultPort: OWON_DEFAULT_PORT,
    create: (port, identity) => new OwonXds(port, identity, XDS_DEFAULT),
    refine: async (port) => {
      const refined = await refineXdsProfile(XDS_DEFAULT, port);
      return (p, i) => new OwonXds(p, i, refined);
    },
  });
  registry.register({
    id: "owon-xds-model-only",
    kind: "oscilloscope",
    match: { manufacturer: /^$/, model: /^XDS\d{3,4}/i },
    defaultPort: OWON_DEFAULT_PORT,
    create: (port, identity) => new OwonXds(port, identity, XDS_DEFAULT),
    refine: async (port) => {
      const refined = await refineXdsProfile(XDS_DEFAULT, port);
      return (p, i) => new OwonXds(p, i, refined);
    },
  });
}
