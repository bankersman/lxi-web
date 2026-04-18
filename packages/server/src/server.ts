import Fastify, { type FastifyInstance } from "fastify";

export interface BuildServerOptions {
  readonly logger?: boolean;
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
