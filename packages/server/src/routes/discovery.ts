import type { FastifyInstance } from "fastify";
import type { DiscoveryService } from "../discovery/index.js";

export async function registerDiscoveryRoutes(
  app: FastifyInstance,
  discovery: DiscoveryService,
): Promise<void> {
  app.get<{ Querystring: { timeoutMs?: string } }>(
    "/api/discovery",
    async (req, reply) => {
      const raw = req.query.timeoutMs;
      let timeoutMs: number | undefined;
      if (raw !== undefined) {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return reply.code(400).send({ error: "timeoutMs must be a positive number" });
        }
        timeoutMs = parsed;
      }
      try {
        const result = await discovery.browse({ timeoutMs });
        return result;
      } catch (err) {
        return reply
          .code(500)
          .send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );
}
