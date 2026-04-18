import { DriverRegistry } from "../../identity/registry.js";
import { SiglentSsa3000x } from "./ssa3000x.js";
import {
  SSA3000X_DEFAULT,
  SSA3000X_VARIANTS,
  refineSsa3000xProfile,
  type Ssa3000xProfile,
} from "./ssa3000x-profile.js";

export { SiglentSsa3000x } from "./ssa3000x.js";
export type { Ssa3000xProfile };
export { SSA3000X_VARIANTS, SSA3000X_DEFAULT, refineSsa3000xProfile };

/**
 * Register every Siglent driver this build ships with. Mirrors the Rigol
 * registrar's shape: per-variant entries plus a tolerant fall-through for
 * unknown SSA3xxx SKUs.
 */
export function registerSiglentDrivers(registry: DriverRegistry): void {
  for (const variant of SSA3000X_VARIANTS) {
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
    create: (port, identity) =>
      new SiglentSsa3000x(port, identity, SSA3000X_DEFAULT),
    refine: async (port) => {
      const refined = await refineSsa3000xProfile(SSA3000X_DEFAULT, port);
      return (p, i) => new SiglentSsa3000x(p, i, refined);
    },
  });
}
