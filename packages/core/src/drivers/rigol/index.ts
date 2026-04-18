import { DriverRegistry } from "../../identity/registry.js";
import { RigolDho800 } from "./dho804.js";
import { RigolDp900 } from "./dp932e.js";
import { RigolDm858 } from "./dm858.js";

export { RigolDho800 } from "./dho804.js";
export { RigolDp900 } from "./dp932e.js";
export { RigolDm858 } from "./dm858.js";

/**
 * Register every Rigol driver this build ships with. Pattern matches are
 * tolerant: firmware suffixes ("DHO804-X") still resolve to the right driver.
 */
export function registerRigolDrivers(registry: DriverRegistry): void {
  registry.register({
    id: "rigol-dho800",
    kind: "oscilloscope",
    match: { manufacturer: "rigol", model: /^DHO8\d{2}/i },
    create: (port, identity) => new RigolDho800(port, identity),
  });

  registry.register({
    id: "rigol-dp900",
    kind: "powerSupply",
    match: { manufacturer: "rigol", model: /^DP9\d{2}/i },
    create: (port, identity) => new RigolDp900(port, identity),
  });

  registry.register({
    id: "rigol-dm800",
    kind: "multimeter",
    match: { manufacturer: "rigol", model: /^DM8\d{2}/i },
    create: (port, identity) => new RigolDm858(port, identity),
  });
}

/** Default registry with all built-in drivers registered. */
export function createDefaultRegistry(): DriverRegistry {
  const registry = new DriverRegistry();
  registerRigolDrivers(registry);
  return registry;
}
