import test from "node:test";
import assert from "node:assert/strict";
import type { ScpiSession, SessionSummary } from "@lxi-web/core";
import { buildServer } from "../src/server.js";
import { SessionManager } from "../src/sessions/manager.js";

interface FakeScpiSession extends ScpiSession {
  readonly writes: string[];
  readonly queries: string[];
}

interface FakeScpiOptions {
  readonly idn: string;
  readonly queryHandler?: (cmd: string) => string | undefined;
}

function fakeScpi(opts: FakeScpiOptions | string): FakeScpiSession {
  const { idn, queryHandler } =
    typeof opts === "string" ? { idn: opts, queryHandler: undefined } : opts;
  const writes: string[] = [];
  const queries: string[] = [];
  return {
    writes,
    queries,
    async query(cmd: string): Promise<string> {
      queries.push(cmd);
      if (cmd === "*IDN?") return idn;
      const custom = queryHandler?.(cmd);
      return custom ?? "";
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
  } as unknown as FakeScpiSession;
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

interface SetupResult {
  readonly app: Awaited<ReturnType<typeof buildServer>>;
  /** Resolves to the last fake session the manager created (null before connect). */
  session(): FakeScpiSession | null;
}

async function setupApp(
  idn: string,
  queryHandler?: (cmd: string) => string | undefined,
): Promise<Awaited<ReturnType<typeof buildServer>>> {
  const manager = new SessionManager({
    scpiFactory: async () => {
      const s = fakeScpi({ idn, queryHandler });
      return { scpi: s, port: s };
    },
  });
  const app = await buildServer({ logger: false, manager });
  return app;
}

async function setupAppCapturing(
  idn: string,
  queryHandler?: (cmd: string) => string | undefined,
): Promise<SetupResult> {
  let last: FakeScpiSession | null = null;
  const manager = new SessionManager({
    scpiFactory: async () => {
      const s = fakeScpi({ idn, queryHandler });
      last = s;
      return { scpi: s, port: s };
    },
  });
  const app = await buildServer({ logger: false, manager });
  return { app, session: () => last };
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

test("PSU pairing endpoint advertises capability and forwards mode changes", async () => {
  const app = await setupApp("RIGOL,DP932E,SN,FW");
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.5" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const info = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/psu/pairing`,
  });
  assert.equal(info.statusCode, 200);
  const body = info.json() as {
    supported: boolean;
    modes: string[];
    channels: number[];
  };
  assert.equal(body.supported, true);
  assert.deepEqual(body.modes, ["off", "series", "parallel"]);
  assert.deepEqual(body.channels, [1, 2]);

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/pairing`,
    payload: { mode: "bogus" },
  });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/pairing`,
    payload: { mode: "series" },
  });
  assert.equal(ok.statusCode, 200);
  await app.close();
});

test("PSU tracking endpoint advertises capability and forwards toggles", async () => {
  const { app, session } = await setupAppCapturing(
    "RIGOL,DP932E,SN,FW",
    (cmd) => (/:OUTPut:TRACk\?/.test(cmd) ? "0" : undefined),
  );
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.6" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const info = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/psu/tracking`,
  });
  assert.equal(info.statusCode, 200);
  const body = info.json() as {
    supported: boolean;
    channels: number[];
    enabled: boolean;
  };
  assert.equal(body.supported, true);
  assert.deepEqual(body.channels, [1, 2]);
  assert.equal(body.enabled, false);

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/tracking`,
    payload: {},
  });
  assert.equal(bad.statusCode, 400);

  const on = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/tracking`,
    payload: { enabled: true },
  });
  assert.equal(on.statusCode, 200);
  assert.ok(session()?.writes.includes(":OUTPut:TRACk ON"));
  await app.close();
});

test("PSU protection endpoints expose OVP/OCP, validate levels, and clear trips", async () => {
  const { app, session } = await setupAppCapturing(
    "RIGOL,DP932E,SN,FW",
    (cmd) => {
      if (/^:OUTPut:OVP\? CH1/.test(cmd)) return "1";
      if (/^:OUTPut:OVP:VALue\? CH1/.test(cmd)) return "12";
      if (/^:OUTPut:OVP:QUES\? CH1/.test(cmd)) return "0";
      if (/^:OUTPut:OCP\? CH1/.test(cmd)) return "0";
      if (/^:OUTPut:OCP:VALue\? CH1/.test(cmd)) return "3";
      if (/^:OUTPut:OCP:QUES\? CH1/.test(cmd)) return "YES";
      return undefined;
    },
  );
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.7" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const read = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/psu/channels/1/protection`,
  });
  assert.equal(read.statusCode, 200);
  const body = read.json() as {
    channel: number;
    ovp: { enabled: boolean; level: number; tripped: boolean };
    ocp: { enabled: boolean; level: number; tripped: boolean };
  };
  assert.equal(body.channel, 1);
  assert.equal(body.ovp.enabled, true);
  assert.equal(body.ovp.level, 12);
  assert.equal(body.ocp.tripped, true);

  const outOfRange = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/channels/1/protection/ovp`,
    payload: { level: 9999 },
  });
  assert.equal(outOfRange.statusCode, 400);

  const wrongKind = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/channels/1/protection/bogus`,
    payload: { enabled: true },
  });
  assert.equal(wrongKind.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/channels/1/protection/ovp`,
    payload: { level: 8.8, enabled: true },
  });
  assert.equal(ok.statusCode, 200);

  const clear = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/channels/1/protection/ocp/clear`,
  });
  assert.equal(clear.statusCode, 200);

  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":OUTPut:OVP:VALue CH1,8.8"));
  assert.ok(writes.includes(":OUTPut:OVP CH1,ON"));
  assert.ok(writes.includes(":OUTPut:OCP:CLEar CH1"));
  await app.close();
});

test("PSU preset endpoints list slots and emit *SAV / *RCL", async () => {
  const { app, session } = await setupAppCapturing(
    "RIGOL,DP932E,SN,FW",
    (cmd) => {
      const match = /:MEMory:VALid\?\s+RIGOL(\d)\.RSF/.exec(cmd);
      if (!match) return undefined;
      return match[1] === "2" ? "1" : "0";
    },
  );
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.8" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");

  const list = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/psu/presets`,
  });
  assert.equal(list.statusCode, 200);
  const body = list.json() as {
    supported: boolean;
    slots: number;
    occupied: boolean[];
  };
  assert.equal(body.supported, true);
  assert.equal(body.slots, 10);
  assert.equal(body.occupied[2], true);
  assert.equal(body.occupied[5], false);

  const badSlot = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/presets/42/save`,
  });
  assert.equal(badSlot.statusCode, 400);

  const save = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/presets/3/save`,
  });
  assert.equal(save.statusCode, 200);

  const recall = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/psu/presets/2/recall`,
  });
  assert.equal(recall.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes("*SAV 3"));
  assert.ok(writes.includes("*RCL 2"));
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
