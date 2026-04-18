import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import type { SessionManager } from "../sessions/manager.js";

export async function registerTranscriptRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: { since?: string; limit?: string };
  }>("/api/sessions/:id/transcript", async (req, reply) => {
    const summary = manager.get(req.params.id);
    if (!summary) return reply.code(404).send({ error: "not found" });
    if (summary.status !== "connected") {
      return reply
        .code(409)
        .send({ error: `session is ${summary.status}, expected 'connected'` });
    }
    const sinceSeq = Math.max(
      0,
      Number.parseInt(String(req.query.since ?? "0"), 10) || 0,
    );
    let limit = Number.parseInt(String(req.query.limit ?? "200"), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 200;
    limit = Math.min(2000, Math.floor(limit));

    const entries = manager.getTranscriptSince(req.params.id, sinceSeq, limit);
    if (entries === null) return reply.code(404).send({ error: "not found" });
    const maxSeq = manager.transcriptMaxSeq(req.params.id) ?? 0;
    return {
      entries,
      maxSeq,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/transcript/export",
    async (req, reply) => {
      const summary = manager.get(req.params.id);
      if (!summary) return reply.code(404).send({ error: "not found" });
      if (summary.status !== "connected") {
        return reply
          .code(409)
          .send({ error: `session is ${summary.status}, expected 'connected'` });
      }
      const iter = manager.iterateTranscriptExport(req.params.id);
      if (!iter) return reply.code(404).send({ error: "not found" });
      const lines = iter;

      async function* ndjson(): AsyncGenerator<string> {
        for (const e of lines) {
          yield `${JSON.stringify(e)}\n`;
        }
      }

      reply.header("content-type", "application/x-ndjson; charset=utf-8");
      return reply.send(Readable.from(ndjson()));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/errors/clear",
    async (req, reply) => {
      const summary = manager.get(req.params.id);
      if (!summary) return reply.code(404).send({ error: "not found" });
      if (summary.status !== "connected") {
        return reply
          .code(409)
          .send({ error: `session is ${summary.status}, expected 'connected'` });
      }
      if (!manager.clearDeviceErrors(req.params.id)) {
        return reply.code(404).send({ error: "not found" });
      }
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/device-errors",
    async (req, reply) => {
      const summary = manager.get(req.params.id);
      if (!summary) return reply.code(404).send({ error: "not found" });
      if (summary.status !== "connected") {
        return reply
          .code(409)
          .send({ error: `session is ${summary.status}, expected 'connected'` });
      }
      const entries = manager.getDeviceErrors(req.params.id);
      if (entries === null) return reply.code(404).send({ error: "not found" });
      return { entries };
    },
  );
}
