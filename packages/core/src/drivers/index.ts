import { DriverRegistry } from "../identity/registry.js";
import { registerRigolDrivers } from "./rigol/index.js";
import { registerSiglentDrivers } from "./siglent/index.js";
import { registerKeysightDrivers } from "./keysight/index.js";
import { registerOwonDrivers } from "./owon/index.js";
import { registerTektronixDrivers } from "./tektronix/index.js";
import { registerRndsDrivers } from "./rnds/index.js";
import { registerFlukeDrivers } from "./fluke/index.js";
import { registerGwInstekDrivers } from "./gw-instek/index.js";

/**
 * Default registry with every bundled vendor pack registered. The order of
 * `register*Drivers` calls has no semantic meaning — each vendor scopes its
 * match patterns to its own `manufacturer` token, so two vendors can never
 * claim the same identity. Add new vendor packs here when they ship.
 */
export function createDefaultRegistry(): DriverRegistry {
  const registry = new DriverRegistry();
  registerRigolDrivers(registry);
  registerSiglentDrivers(registry);
  registerKeysightDrivers(registry);
  registerOwonDrivers(registry);
  registerTektronixDrivers(registry);
  registerRndsDrivers(registry);
  registerFlukeDrivers(registry);
  registerGwInstekDrivers(registry);
  return registry;
}
