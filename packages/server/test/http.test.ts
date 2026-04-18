import test from "node:test";
import assert from "node:assert/strict";
import type { ScpiSession, SessionSummary } from "@lxi-web/core";
import { buildServer } from "../src/server.js";
import { SessionManager } from "../src/sessions/manager.js";

function fakeScpi(idn: string): ScpiSession {
  const writes: string[] = [];
  return {
    async query(cmd: string): Promise<string> {
      if (cmd === "*IDN?") return idn;
      return "";
    },
    async write(cmd: string): Promise<void> {
      writes.push(cmd);
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async close(): Promise<void> {},
    get closed() {
      return false;
    },
  } as unknown as ScpiSession;
}

async function waitForStatus(
  app: Awaited<ReturnType<typeof buildServer>>,
  id: string,
  target: SessionSummary["status"],
): Promise<SessionSummary> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    const res = await app.inject({ method: "GET", url: `/api/sessions/${id}` });
    if (res.statusCode === 200) {
      const body = res.json() as { session: SessionSummary };
      if (body.session.status === target) return body.session;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`status ${target} not reached`);
}

async function setupApp(idn: string): Promise<
  Awaited<ReturnType<typeof buildServer>>
> {
  const manager = new SessionManager({
    scpiFactory: async () => {
      const s = fakeScpi(idn);
      return { scpi: s, port: s };
    },
  });
  const app = await buildServer({ logger: false, manager });
  return app;
}

test("health endpoint returns ok", async () => {
  const app = await setupApp("RIGOL,DHO804,SN,FW");
  const res = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  await app.close();
});

test("POST /api/sessions validates body and opens a session", async () => {
  const app = await setupApp("RIGOL,DHO804,SN,FW");
  const bad = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "192.168.1.10", port: 5025 },
  });
  assert.equal(ok.statusCode, 201);
  const body = ok.json() as { session: SessionSummary };
  assert.equal(body.session.status, "connecting");

  const connected = await waitForStatus(app, body.session.id, "connected");
  assert.equal(connected.kind, "oscilloscope");
  assert.equal(connected.driverId, "rigol-dho800");

  const list = await app.inject({ method: "GET", url: "/api/sessions" });
  const listed = list.json() as { sessions: SessionSummary[] };
  assert.equal(listed.sessions.length, 1);

  await app.close();
});

test("DELETE /api/sessions/:id closes and removes", async () => {
  const app = await setupApp("RIGOL,DP932E,SN,FW");
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.2" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const deleted = await app.inject({ method: "DELETE", url: `/api/sessions/${id}` });
  assert.equal(deleted.statusCode, 200);
  const miss = await app.inject({ method: "GET", url: `/api/sessions/${id}` });
  assert.equal(miss.statusCode, 404);
  await app.close();
});

test("POST /api/sessions/:id/scpi forwards raw SCPI and returns reply", async () => {
  const app = await setupApp("ACME,MYSTERY-9000,SN,FW");
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.3" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const reply = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scpi`,
    payload: { command: "*IDN?" },
  });
  assert.equal(reply.statusCode, 200);
  assert.equal((reply.json() as { reply: string }).reply, "ACME,MYSTERY-9000,SN,FW");
  await app.close();
});

test("typed route rejects mismatched device kind", async () => {
  const app = await setupApp("RIGOL,DHO804,SN,FW");
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.4" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const res = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/dmm/reading`,
  });
  assert.equal(res.statusCode, 409);
  await app.close();
});
