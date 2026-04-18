import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../sessions/manager.js";
import { registerDmmRoutes } from "./dmm.js";
import { registerEloadRoutes } from "./eload.js";
import { registerPsuRoutes } from "./psu.js";
import { registerScopeRoutes } from "./scope.js";
import { registerSgRoutes } from "./sg.js";
import { registerSaRoutes } from "./sa.js";

export async function registerDeviceRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  await registerScopeRoutes(app, manager);
  await registerPsuRoutes(app, manager);
  await registerDmmRoutes(app, manager);
  await registerEloadRoutes(app, manager);
  await registerSgRoutes(app, manager);
  await registerSaRoutes(app, manager);
}
