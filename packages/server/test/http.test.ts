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

// ---- Helpers for device-specific tests ----

async function openDmm(
  queryHandler?: (cmd: string) => string | undefined,
): Promise<{ app: Awaited<ReturnType<typeof buildServer>>; id: string; session: () => FakeScpiSession | null }> {
  const { app, session } = await setupAppCapturing("RIGOL,DM858,SN,FW", queryHandler);
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.20" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");
  return { app, id, session };
}

async function openScope(
  queryHandler?: (cmd: string) => string | undefined,
): Promise<{ app: Awaited<ReturnType<typeof buildServer>>; id: string; session: () => FakeScpiSession | null }> {
  const { app, session } = await setupAppCapturing("RIGOL,DHO804,SN,FW", queryHandler);
  const opened = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: { host: "10.0.0.30" },
  });
  const id = (opened.json() as { session: SessionSummary }).session.id;
  await waitForStatus(app, id, "connected");
  return { app, id, session };
}

// ---- DMM route tests (2.6a / 2.6b / 2.6c) ----

test("DMM ranging GET exposes capability and POST forwards setAutoZero", async () => {
  const { app, id, session } = await openDmm((cmd) => {
    if (/:FUNCtion\?/.test(cmd)) return '"VOLT"';
    if (/:SENSe:VOLTage:DC:RANGe:AUTO\?/.test(cmd)) return "1";
    if (/:SENSe:VOLTage:DC:RANGe\?/.test(cmd)) return "20";
    if (/:SENSe:VOLTage:DC:NPLC\?/.test(cmd)) return "1";
    return undefined;
  });
  const info = await app.inject({ method: "GET", url: `/api/sessions/${id}/dmm/ranging` });
  assert.equal(info.statusCode, 200);
  const body = info.json() as { supported: boolean; capability: { nplc: number[] } };
  assert.equal(body.supported, true);
  assert.ok(body.capability.nplc.includes(10));

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/ranging`,
    payload: { autoZero: "bogus" },
  });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/ranging`,
    payload: { nplc: 10, autoZero: "once" },
  });
  assert.equal(ok.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.some((w) => /NPLC 10/.test(w)));
  assert.ok(writes.some((w) => /ZERO:AUTO ONCE/.test(w)));
  await app.close();
});

test("DMM ranging rejects nplc outside the capability list", async () => {
  const { app, id } = await openDmm((cmd) => (/:FUNCtion\?/.test(cmd) ? '"VOLT"' : undefined));
  const res = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/ranging`,
    payload: { nplc: 0.5 },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("DMM trigger endpoints validate input and forward config", async () => {
  const { app, id, session } = await openDmm((cmd) => {
    if (/:TRIGger:SOURce\?/.test(cmd)) return "IMM";
    if (/:TRIGger:SLOPe\?/.test(cmd)) return "POS";
    if (/:TRIGger:DELay\?/.test(cmd)) return "0";
    if (/:SAMPle:COUNt\?/.test(cmd)) return "1";
    return undefined;
  });
  const get = await app.inject({ method: "GET", url: `/api/sessions/${id}/dmm/trigger` });
  assert.equal(get.statusCode, 200);
  const body = get.json() as { supported: boolean; config: { source: string } };
  assert.equal(body.supported, true);
  assert.equal(body.config.source, "immediate");

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/trigger`,
    payload: { source: "invalid" },
  });
  assert.equal(bad.statusCode, 400);

  const outOfRange = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/trigger`,
    payload: { sampleCount: 9_999_999 },
  });
  assert.equal(outOfRange.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/trigger`,
    payload: { source: "external", slope: "negative", sampleCount: 10, delaySec: 0.1 },
  });
  assert.equal(ok.statusCode, 200);
  const fire = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/trigger/fire`,
  });
  assert.equal(fire.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":TRIGger:SOURce EXTernal"));
  assert.ok(writes.includes(":TRIGger:SLOPe NEGative"));
  assert.ok(writes.includes("*TRG"));
  await app.close();
});

test("DMM math endpoint validates function and forwards config", async () => {
  const { app, id, session } = await openDmm((cmd) => {
    if (/:FUNCtion\?/.test(cmd)) return '"VOLT"';
    return undefined;
  });

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/math`,
    payload: { function: "unknown" },
  });
  assert.equal(bad.statusCode, 400);

  const badLimits = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/math`,
    payload: { function: "limit", limitUpper: 1, limitLower: 5 },
  });
  assert.equal(badLimits.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/math`,
    payload: { function: "null", nullOffset: 0.1 },
  });
  assert.equal(ok.statusCode, 200);

  const resetSupported = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/math/reset`,
  });
  assert.equal(resetSupported.statusCode, 200);

  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":CALCulate:FUNCtion NULL"));
  assert.ok(writes.includes(":CALCulate:NULL:OFFSet 0.1"));
  assert.ok(writes.includes(":CALCulate:AVERage:CLEar"));
  await app.close();
});

test("DMM dual display rejects incompatible secondary mode", async () => {
  const { app, id } = await openDmm((cmd) =>
    /:FUNCtion\?/.test(cmd) ? '"VOLT"' : undefined,
  );

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/dual`,
    payload: { secondary: "temperature" },
  });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/dual`,
    payload: { secondary: "frequency" },
  });
  assert.equal(ok.statusCode, 200);

  const off = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/dual`,
    payload: { secondary: null },
  });
  assert.equal(off.statusCode, 200);
  await app.close();
});

test("DMM temperature endpoint validates unit/transducer", async () => {
  const { app, id, session } = await openDmm();
  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/temperature`,
    payload: { unit: "martian", transducer: "pt100" },
  });
  assert.equal(bad.statusCode, 400);
  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/temperature`,
    payload: { unit: "celsius", transducer: "thermocouple-k" },
  });
  assert.equal(ok.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":UNIT:TEMPerature C"));
  assert.ok(writes.some((w) => /TCouple,K/.test(w)));
  await app.close();
});

test("DMM presets endpoints validate slots and emit *SAV / *RCL", async () => {
  const { app, id, session } = await openDmm();
  const list = await app.inject({ method: "GET", url: `/api/sessions/${id}/dmm/presets` });
  assert.equal(list.statusCode, 200);
  const body = list.json() as { slots: number; occupied: boolean[] };
  assert.equal(body.slots, 10);
  assert.equal(body.occupied.length, 10);

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/presets/99/save`,
  });
  assert.equal(bad.statusCode, 400);

  const saved = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/presets/4/save`,
  });
  assert.equal(saved.statusCode, 200);
  const recalled = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/presets/4/recall`,
  });
  assert.equal(recalled.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes("*SAV 4"));
  assert.ok(writes.includes("*RCL 4"));
  await app.close();
});

test("DMM logging start/status/samples/stop round-trip", async () => {
  const { app, id } = await openDmm((cmd) => {
    if (/:READ\?/.test(cmd)) return "1.5";
    if (/:FUNCtion\?/.test(cmd)) return '"VOLT"';
    return undefined;
  });

  const badInterval = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/logging/start`,
    payload: { intervalMs: 1 },
  });
  assert.equal(badInterval.statusCode, 400);

  const start = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/logging/start`,
    payload: { intervalMs: 50, totalSamples: 3 },
  });
  assert.equal(start.statusCode, 200);
  const started = start.json() as { runId: string };
  assert.ok(started.runId);

  // Allow the timer to fire once or twice.
  await new Promise((r) => setTimeout(r, 200));

  const status = await app.inject({ method: "GET", url: `/api/sessions/${id}/dmm/logging` });
  assert.equal(status.statusCode, 200);
  const statusBody = status.json() as { status: { samplesEmitted: number } };
  assert.ok(statusBody.status.samplesEmitted >= 1);

  const samples = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/dmm/logging/samples?since=0`,
  });
  assert.equal(samples.statusCode, 200);
  const samplesBody = samples.json() as { samples: unknown[] };
  assert.ok(samplesBody.samples.length >= 1);

  const stop = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/dmm/logging/stop`,
  });
  assert.equal(stop.statusCode, 200);
  await app.close();
});

// ---- Scope route tests (2.7a / 2.7b / 2.7c / 2.7d) ----

test("scope trigger endpoint validates type and forwards edge config", async () => {
  const { app, id, session } = await openScope();
  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/trigger`,
    payload: { type: "unknown" },
  });
  assert.equal(bad.statusCode, 400);

  const badSrc = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/trigger`,
    payload: { type: "edge", source: "CH9", slope: "rising", level: 0.1 },
  });
  assert.equal(badSrc.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/trigger`,
    payload: { type: "edge", source: "CH1", slope: "rising", level: 1.5 },
  });
  assert.equal(ok.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":TRIGger:MODE EDGE"));
  assert.ok(writes.includes(":TRIGger:EDGE:LEVel 1.5"));
  await app.close();
});

test("scope trigger sweep endpoint validates and forwards mode", async () => {
  const { app, id, session } = await openScope();
  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/trigger/sweep`,
    payload: { mode: "fast" },
  });
  assert.equal(bad.statusCode, 400);
  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/trigger/sweep`,
    payload: { mode: "single" },
  });
  assert.equal(ok.statusCode, 200);
  const force = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/trigger/force`,
  });
  assert.equal(force.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":TRIGger:SWEep SINGle"));
  assert.ok(writes.includes(":TFORce"));
  await app.close();
});

test("scope acquisition validates mode and averages range", async () => {
  const { app, id, session } = await openScope();
  const badMode = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/acquisition`,
    payload: { mode: "bogus", averages: 2, memoryDepth: "auto" },
  });
  assert.equal(badMode.statusCode, 400);

  const badDepth = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/acquisition`,
    payload: { mode: "normal", averages: 2, memoryDepth: "99G" },
  });
  assert.equal(badDepth.statusCode, 400);

  const badAverages = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/acquisition`,
    payload: { mode: "average", averages: 100_000, memoryDepth: "auto" },
  });
  assert.equal(badAverages.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/acquisition`,
    payload: { mode: "average", averages: 64, memoryDepth: "1M" },
  });
  assert.equal(ok.statusCode, 200);
  await app.inject({ method: "POST", url: `/api/sessions/${id}/scope/autoset` });
  await app.inject({ method: "POST", url: `/api/sessions/${id}/scope/run` });
  await app.inject({ method: "POST", url: `/api/sessions/${id}/scope/stop` });
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":ACQuire:TYPE AVERages"));
  assert.ok(writes.includes(":ACQuire:AVERages 64"));
  assert.ok(writes.includes(":ACQuire:MDEPth 1000000"));
  assert.ok(writes.includes(":AUToset"));
  assert.ok(writes.includes(":RUN"));
  assert.ok(writes.includes(":STOP"));
  await app.close();
});

test("scope measurements validate items and sources and enforce max", async () => {
  const { app, id } = await openScope();

  const unknown = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/measurements`,
    payload: { selections: [{ id: "bogus", source: "CH1" }] },
  });
  assert.equal(unknown.statusCode, 400);

  const badSource = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/measurements`,
    payload: { selections: [{ id: "vpp", source: "CH9" }] },
  });
  assert.equal(badSource.statusCode, 400);

  const tooMany = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/measurements`,
    payload: {
      selections: Array.from({ length: 11 }, () => ({ id: "vpp", source: "CH1" })),
    },
  });
  assert.equal(tooMany.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/measurements`,
    payload: { selections: [{ id: "vpp", source: "CH1" }] },
  });
  assert.equal(ok.statusCode, 200);

  const clear = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/measurements/clear-stats`,
  });
  assert.equal(clear.statusCode, 200);
  await app.close();
});

test("scope cursors endpoint validates mode", async () => {
  const { app, id, session } = await openScope();
  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/cursors`,
    payload: { mode: "bogus", axis: "x" },
  });
  assert.equal(bad.statusCode, 400);
  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/cursors`,
    payload: { mode: "manual", axis: "x", aX: 0.001, bX: 0.002 },
  });
  assert.equal(ok.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":CURSor:MODE MANual"));
  await app.close();
});

test("scope math endpoint validates operator and fft window", async () => {
  const { app, id, session } = await openScope();
  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/math`,
    payload: { enabled: true, operator: "bogus", source1: "CH1" },
  });
  assert.equal(bad.statusCode, 400);

  const badWindow = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/math`,
    payload: {
      enabled: true,
      operator: "fft",
      source1: "CH1",
      fft: { window: "bogus", span: 1e6, center: 5e5 },
    },
  });
  assert.equal(badWindow.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/math`,
    payload: {
      enabled: true,
      operator: "fft",
      source1: "CH1",
      fft: { window: "hanning", span: 1e6, center: 5e5 },
    },
  });
  assert.equal(ok.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":MATH:FFT:WINDow HANN"));
  await app.close();
});

test("scope references endpoint validates slot bounds and forwards save/toggle", async () => {
  const { app, id, session } = await openScope();

  const list = await app.inject({ method: "GET", url: `/api/sessions/${id}/scope/references` });
  assert.equal(list.statusCode, 200);
  const body = list.json() as { supported: boolean; capability: { slots: number } };
  assert.equal(body.capability.slots, 10);

  const badSlot = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/references/99/save`,
    payload: { source: "CH1" },
  });
  assert.equal(badSlot.statusCode, 400);

  const missingSrc = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/references/0/save`,
    payload: {},
  });
  assert.equal(missingSrc.statusCode, 400);

  const save = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/references/0/save`,
    payload: { source: "CH1" },
  });
  assert.equal(save.statusCode, 200);

  const toggle = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/references/0`,
    payload: { enabled: true },
  });
  assert.equal(toggle.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":REFerence:SAVE"));
  assert.ok(writes.includes(":REFerence:REF1:DISPlay ON"));
  await app.close();
});

test("scope history endpoint forwards enable/frame/play", async () => {
  const { app, id, session } = await openScope();
  const res = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/history`,
    payload: { enabled: true, frame: 12, playing: true },
  });
  assert.equal(res.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":HISTory:DISPlay ON"));
  assert.ok(writes.includes(":HISTory:FRAMe 12"));
  assert.ok(writes.includes(":HISTory:PLAY ON"));
  await app.close();
});

test("scope display validates persistence and screenshot format", async () => {
  const { app, id, session } = await openScope();
  const badPersist = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/display`,
    payload: { persistence: "forever" },
  });
  assert.equal(badPersist.statusCode, 400);
  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/display`,
    payload: { persistence: "infinite" },
  });
  assert.equal(ok.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":DISPlay:GRADing:TIME INFinite"));

  const badFormat = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/scope/screenshot?format=tiff`,
  });
  assert.equal(badFormat.statusCode, 400);

  const shot = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/scope/screenshot?format=png`,
  });
  assert.equal(shot.statusCode, 200);
  assert.equal(shot.headers["content-type"], "image/png");
  await app.close();
});

test("scope presets endpoint validates slot and emits save/recall", async () => {
  const { app, id, session } = await openScope();
  const list = await app.inject({ method: "GET", url: `/api/sessions/${id}/scope/presets` });
  assert.equal(list.statusCode, 200);

  const bad = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/presets/42/save`,
  });
  assert.equal(bad.statusCode, 400);

  const save = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/presets/2/save`,
  });
  assert.equal(save.statusCode, 200);
  const recall = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/presets/2/recall`,
  });
  assert.equal(recall.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes("*SAV 2"));
  assert.ok(writes.includes("*RCL 2"));
  await app.close();
});

test("scope decoder endpoint validates bus + protocol and configures bus", async () => {
  const { app, id, session } = await openScope();

  const badBus = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/buses/5`,
    payload: { protocol: "i2c", sclSource: "CH1", sdaSource: "CH2", addressMode: "7bit" },
  });
  assert.equal(badBus.statusCode, 400);

  const ok = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/buses/1`,
    payload: { protocol: "i2c", sclSource: "CH1", sdaSource: "CH2", addressMode: "7bit" },
  });
  assert.equal(ok.statusCode, 200);

  const buses = await app.inject({ method: "GET", url: `/api/sessions/${id}/scope/buses` });
  assert.equal(buses.statusCode, 200);
  const body = buses.json() as { buses: Array<{ enabled: boolean; config?: { protocol: string } }> };
  assert.equal(body.buses[0]!.enabled, true);
  assert.equal(body.buses[0]!.config?.protocol, "i2c");

  const disable = await app.inject({
    method: "POST",
    url: `/api/sessions/${id}/scope/buses/1`,
    payload: {},
  });
  assert.equal(disable.statusCode, 200);
  const writes = session()?.writes ?? [];
  assert.ok(writes.includes(":BUS1:MODE IIC"));
  assert.ok(writes.includes(":BUS1:DISPlay ON"));
  assert.ok(writes.includes(":BUS1:DISPlay OFF"));

  const packets = await app.inject({
    method: "GET",
    url: `/api/sessions/${id}/scope/buses/1/packets`,
  });
  assert.equal(packets.statusCode, 200);
  const pBody = packets.json() as { packets: unknown[] };
  assert.deepEqual(pBody.packets, []);
  await app.close();
});
