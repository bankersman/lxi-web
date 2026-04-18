import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../sessions/manager.js";

export async function registerPanicRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  app.post<{
    Body: { timeoutMs?: unknown };
  }>("/api/panic", async (req, reply) => {
    const body = req.body ?? {};
    let timeoutMs: number | undefined;
    if (body.timeoutMs !== undefined) {
      const n = typeof body.timeoutMs === "number" ? body.timeoutMs : Number(body.timeoutMs);
      if (!Number.isFinite(n) || n <= 0 || n > 60_000) {
        return reply.code(400).send({ error: "timeoutMs must be 1..60000" });
      }
      timeoutMs = Math.floor(n);
    }
    const result = await manager.panic(timeoutMs !== undefined ? { timeoutMs } : undefined);
    return result;
  });

  app.get("/api/panic/history", async () => ({
    history: manager.getPanicHistory(),
  }));
}
