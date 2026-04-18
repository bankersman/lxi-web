import type { FastifyInstance } from "fastify";
import { DEFAULT_SCPI_PORT } from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

export async function registerSessionRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  app.get("/api/sessions", async () => ({ sessions: manager.list() }));

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      const session = manager.get(req.params.id);
      if (!session) return reply.code(404).send({ error: "not found" });
      return { session };
    },
  );

  app.post<{
    Body: { host?: unknown; port?: unknown };
  }>("/api/sessions", async (req, reply) => {
    const body = req.body ?? {};
    const host = typeof body.host === "string" ? body.host.trim() : "";
    if (!host) return reply.code(400).send({ error: "host is required" });
    let port = DEFAULT_SCPI_PORT;
    if (body.port !== undefined) {
      const parsed = typeof body.port === "number" ? body.port : Number(body.port);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        return reply.code(400).send({ error: "port must be 1..65535" });
      }
      port = parsed;
    }
    try {
      const session = manager.open({ host, port });
      return reply.code(201).send({ session });
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      if (!manager.get(req.params.id)) {
        return reply.code(404).send({ error: "not found" });
      }
      await manager.close(req.params.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/reconnect",
    async (req, reply) => {
      const summary = manager.reconnect(req.params.id);
      if (!summary) return reply.code(404).send({ error: "not found" });
      return { session: summary };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { command?: unknown; expectReply?: unknown };
  }>("/api/sessions/:id/scpi", async (req, reply) => {
    const summary = manager.get(req.params.id);
    if (!summary) return reply.code(404).send({ error: "not found" });
    if (summary.status !== "connected") {
      return reply
        .code(409)
        .send({ error: `session is ${summary.status}, expected 'connected'` });
    }
    const body = req.body ?? {};
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) return reply.code(400).send({ error: "command is required" });
    const expectReply = Boolean(body.expectReply ?? command.includes("?"));
    try {
      const out = await manager.sendRaw(req.params.id, command, expectReply);
      return { reply: out };
    } catch (err) {
      return reply
        .code(502)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
