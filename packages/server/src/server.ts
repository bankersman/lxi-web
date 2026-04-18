import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { SessionManager } from "./sessions/manager.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTranscriptRoutes } from "./routes/transcript.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerDiscoveryRoutes } from "./routes/discovery.js";
import { registerWebsocketRoute } from "./routes/ws.js";
import { registerWebRoutes } from "./routes/web.js";
import {
  DiscoveryService,
  createBonjourFactoryBuilder,
} from "./discovery/index.js";

export interface BuildServerOptions {
  readonly logger?: boolean;
  readonly manager?: SessionManager;
  readonly discovery?: DiscoveryService;
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
  const discovery =
    options.discovery ??
    new DiscoveryService({
      factoryBuilder: createBonjourFactoryBuilder(),
    });

  app.get("/api/health", async () => ({ ok: true }));
  app.get("/healthz", async () => ({ status: "ok" }));

  await registerSessionRoutes(app, manager);
  await registerTranscriptRoutes(app, manager);
  await registerDeviceRoutes(app, manager);
  await registerDiscoveryRoutes(app, discovery);
  await registerWebsocketRoute(app, manager);
  await registerWebRoutes(app);

  app.addHook("onClose", async () => {
    await manager.closeAll();
  });

  app.decorate("sessionManager", manager);
  app.decorate("discovery", discovery);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    sessionManager: SessionManager;
    discovery: DiscoveryService;
  }
}
