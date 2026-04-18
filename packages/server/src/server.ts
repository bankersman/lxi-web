import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { SessionManager } from "./sessions/manager.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerWebsocketRoute } from "./routes/ws.js";

export interface BuildServerOptions {
  readonly logger?: boolean;
  readonly manager?: SessionManager;
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(websocket);

  const manager = options.manager ?? new SessionManager();

  app.get("/api/health", async () => ({ ok: true }));

  await registerSessionRoutes(app, manager);
  await registerDeviceRoutes(app, manager);
  await registerWebsocketRoute(app, manager);

  app.addHook("onClose", async () => {
    await manager.closeAll();
  });

  app.decorate("sessionManager", manager);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    sessionManager: SessionManager;
  }
}
