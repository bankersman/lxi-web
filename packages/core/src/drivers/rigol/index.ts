import { DriverRegistry } from "../../identity/registry.js";
import { registerSiglentDrivers } from "../siglent/index.js";
import { registerKeysightDrivers } from "../keysight/index.js";
import { registerOwonDrivers } from "../owon/index.js";
import { registerTektronixDrivers } from "../tektronix/index.js";
import { registerRndsDrivers } from "../rnds/index.js";
import { registerFlukeDrivers } from "../fluke/index.js";
import { RigolDho800 } from "./dho800.js";
import { RigolDp900 } from "./dp900.js";
import { RigolDm800 } from "./dm800.js";
import { RigolDl3000 } from "./dl3000.js";
import { RigolDg900 } from "./dg900.js";
import {
  DHO800_DEFAULT,
  DHO800_VARIANTS,
  refineDho800Profile,
  type Dho800Profile,
} from "./dho800-profile.js";
import {
  DP900_DEFAULT,
  DP900_VARIANTS,
  refineDp900Profile,
  type Dp900Profile,
} from "./dp900-profile.js";
import {
  DM800_DEFAULT,
  DM800_VARIANTS,
  refineDm800Profile,
  type Dm800Profile,
} from "./dm800-profile.js";
import {
  DL3000_DEFAULT,
  DL3000_VARIANTS,
  refineDl3000Profile,
  type Dl3000Profile,
} from "./dl3000-profile.js";
import {
  DG800_DEFAULT,
  DG900_DEFAULT,
  DG900_VARIANTS,
  refineDg900Profile,
  type Dg900Profile,
} from "./dg900-profile.js";

export { RigolDho800 } from "./dho800.js";
export { RigolDp900 } from "./dp900.js";
export { RigolDm800 } from "./dm800.js";
export { RigolDl3000 } from "./dl3000.js";
export { RigolDg900 } from "./dg900.js";
/**
 * Deprecated: the DMM driver is now family-scoped. Consumers of
 * `@lxi-web/core` built against 3.7 still import `RigolDm858`; keep the
 * alias for one minor release and then drop it.
 * @deprecated Import `RigolDm800` instead.
 */
export { RigolDm800 as RigolDm858 } from "./dm800.js";

export type { Dho800Profile, Dp900Profile, Dm800Profile, Dl3000Profile, Dg900Profile };
export {
  DHO800_VARIANTS,
  DHO800_DEFAULT,
  DP900_VARIANTS,
  DP900_DEFAULT,
  DM800_VARIANTS,
  DM800_DEFAULT,
  DL3000_VARIANTS,
  DL3000_DEFAULT,
  DG900_VARIANTS,
  DG800_DEFAULT,
  DG900_DEFAULT,
};

/**
 * Register every Rigol driver this build ships with. One `DriverEntry`
 * per known variant plus a conservative catch-all per family. Patterns
 * are tolerant: firmware suffixes ("DHO804-X") still resolve.
 */
export function registerRigolDrivers(registry: DriverRegistry): void {
  for (const variant of DHO800_VARIANTS) {
    registry.register({
      id: `rigol-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: {
        manufacturer: "rigol",
        model: new RegExp(`^${variant.variant}\\b`, "i"),
      },
      create: (port, identity) => new RigolDho800(port, identity, variant),
      refine: async (port) => {
        const refined = await refineDho800Profile(variant, port);
        return (p, i) => new RigolDho800(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rigol-dho800",
    kind: "oscilloscope",
    match: { manufacturer: "rigol", model: /^DHO8\d{2}/i },
    create: (port, identity) => new RigolDho800(port, identity, DHO800_DEFAULT),
    refine: async (port) => {
      const refined = await refineDho800Profile(DHO800_DEFAULT, port);
      return (p, i) => new RigolDho800(p, i, refined);
    },
  });

  for (const variant of DP900_VARIANTS) {
    registry.register({
      id: `rigol-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: {
        manufacturer: "rigol",
        model: new RegExp(`^${variant.variant}\\b`, "i"),
      },
      create: (port, identity) => new RigolDp900(port, identity, variant),
      refine: async (port) => {
        const refined = await refineDp900Profile(variant, port);
        return (p, i) => new RigolDp900(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rigol-dp900",
    kind: "powerSupply",
    match: { manufacturer: "rigol", model: /^DP9\d{2}/i },
    create: (port, identity) => new RigolDp900(port, identity, DP900_DEFAULT),
    refine: async (port) => {
      const refined = await refineDp900Profile(DP900_DEFAULT, port);
      return (p, i) => new RigolDp900(p, i, refined);
    },
  });

  for (const variant of DM800_VARIANTS) {
    registry.register({
      id: `rigol-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: {
        manufacturer: "rigol",
        model: new RegExp(`^${variant.variant}\\b`, "i"),
      },
      create: (port, identity) => new RigolDm800(port, identity, variant),
      refine: async (port) => {
        const refined = await refineDm800Profile(variant, port);
        return (p, i) => new RigolDm800(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rigol-dm800",
    kind: "multimeter",
    match: { manufacturer: "rigol", model: /^DM8\d{2}/i },
    create: (port, identity) => new RigolDm800(port, identity, DM800_DEFAULT),
    refine: async (port) => {
      const refined = await refineDm800Profile(DM800_DEFAULT, port);
      return (p, i) => new RigolDm800(p, i, refined);
    },
  });

  for (const variant of DL3000_VARIANTS) {
    registry.register({
      id: `rigol-${variant.variant.toLowerCase()}`,
      kind: "electronicLoad",
      match: {
        manufacturer: "rigol",
        model: new RegExp(`^${variant.variant}\\b`, "i"),
      },
      create: (port, identity) => new RigolDl3000(port, identity, variant),
      refine: async (port) => {
        const refined = await refineDl3000Profile(variant, port);
        return (p, i) => new RigolDl3000(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rigol-dl3000",
    kind: "electronicLoad",
    match: { manufacturer: "rigol", model: /^DL30\d{2}/i },
    create: (port, identity) => new RigolDl3000(port, identity, DL3000_DEFAULT),
    refine: async (port) => {
      const refined = await refineDl3000Profile(DL3000_DEFAULT, port);
      return (p, i) => new RigolDl3000(p, i, refined);
    },
  });

  for (const variant of DG900_VARIANTS) {
    registry.register({
      id: `rigol-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: {
        manufacturer: "rigol",
        model: new RegExp(`^${variant.variant}\\b`, "i"),
      },
      create: (port, identity) => new RigolDg900(port, identity, variant),
      refine: async (port) => {
        const refined = await refineDg900Profile(variant, port);
        return (p, i) => new RigolDg900(p, i, refined);
      },
    });
  }
  registry.register({
    id: "rigol-dg800",
    kind: "signalGenerator",
    match: { manufacturer: "rigol", model: /^DG8\d{2}/i },
    create: (port, identity) => new RigolDg900(port, identity, DG800_DEFAULT),
    refine: async (port) => {
      const refined = await refineDg900Profile(DG800_DEFAULT, port);
      return (p, i) => new RigolDg900(p, i, refined);
    },
  });
  registry.register({
    id: "rigol-dg900",
    kind: "signalGenerator",
    match: { manufacturer: "rigol", model: /^DG9\d{2}/i },
    create: (port, identity) => new RigolDg900(port, identity, DG900_DEFAULT),
    refine: async (port) => {
      const refined = await refineDg900Profile(DG900_DEFAULT, port);
      return (p, i) => new RigolDg900(p, i, refined);
    },
  });
}

/** Default registry with all built-in drivers registered. */
export function createDefaultRegistry(): DriverRegistry {
  const registry = new DriverRegistry();
  registerRigolDrivers(registry);
  registerSiglentDrivers(registry);
  registerKeysightDrivers(registry);
  registerOwonDrivers(registry);
  registerTektronixDrivers(registry);
  registerRndsDrivers(registry);
  registerFlukeDrivers(registry);
  return registry;
}
