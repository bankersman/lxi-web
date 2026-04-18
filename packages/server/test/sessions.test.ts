import test from "node:test";
import assert from "node:assert/strict";
import type { ScpiSession, SessionSummary } from "@lxi-web/core";
import { SessionManager } from "../src/sessions/manager.js";

interface FakeScpi {
  onQueryIdn(reply: string): FakeScpi;
  onQueryFails(err: Error): FakeScpi;
  session: ScpiSession;
  closed: boolean;
}

function makeFakeScpi(): FakeScpi {
  const state: {
    idnReply?: string;
    idnFail?: Error;
    closed: boolean;
    writes: string[];
  } = { closed: false, writes: [] };
  const api: FakeScpi = {
    onQueryIdn(reply) {
      state.idnReply = reply;
      return api;
    },
    onQueryFails(err) {
      state.idnFail = err;
      return api;
    },
    session: {
      async query(cmd: string): Promise<string> {
        if (state.idnFail) throw state.idnFail;
        if (cmd === "*IDN?") return state.idnReply ?? "UNKNOWN,UNKNOWN,0,0";
        return "";
      },
      async write(cmd: string): Promise<void> {
        state.writes.push(cmd);
      },
      async queryBinary(): Promise<Uint8Array> {
        return new Uint8Array();
      },
      async close(): Promise<void> {
        state.closed = true;
      },
      get closed() {
        return state.closed;
      },
    } as unknown as ScpiSession,
    get closed() {
      return state.closed;
    },
  };
  return api;
}

/** Wait until predicate returns true, polling every `intervalMs`. */
async function waitFor<T extends SessionSummary | null>(
  get: () => T,
  pred: (value: T) => boolean,
  timeoutMs = 1000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = get();
    if (pred(value)) return value;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timeout");
}

test("open returns a connecting summary and transitions to connected on *IDN?", async () => {
  const fake = makeFakeScpi().onQueryIdn("RIGOL TECHNOLOGIES,DHO804,SN,FW");
  const manager = new SessionManager({
    scpiFactory: async () => ({ scpi: fake.session, port: fake.session }),
  });

  const updates: SessionSummary[] = [];
  manager.on("update", (summary) => updates.push(summary));

  const initial = manager.open({ host: "192.168.1.10", port: 5025 });
  assert.equal(initial.status, "connecting");
  assert.equal(initial.kind, "unknown");

  const final = await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "connected",
  );
  assert.equal(final!.kind, "oscilloscope");
  assert.equal(final!.driverId, "rigol-dho800");
  assert.equal(final!.identity?.model, "DHO804");
  assert.ok(updates.length >= 2);
});

test("unidentified instrument stays connected with kind 'unknown'", async () => {
  const fake = makeFakeScpi().onQueryIdn("ACME,NONESUCH-9000,SN,FW");
  const manager = new SessionManager({
    scpiFactory: async () => ({ scpi: fake.session, port: fake.session }),
  });

  const initial = manager.open({ host: "10.0.0.2" });
  const final = await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "connected",
  );
  assert.equal(final!.kind, "unknown");
  assert.equal(final!.driverId, null);
  assert.equal(final!.identity?.model, "NONESUCH-9000");
});

test("connect failure transitions to status 'error' and records message", async () => {
  const boom = new Error("ECONNREFUSED");
  const manager = new SessionManager({
    scpiFactory: async () => {
      throw boom;
    },
  });

  const initial = manager.open({ host: "10.0.0.2" });
  const final = await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "error",
  );
  assert.equal(final!.error?.message, "ECONNREFUSED");
});

test("close removes the session and emits removed", async () => {
  const fake = makeFakeScpi().onQueryIdn("RIGOL,DP932E,SN,FW");
  const manager = new SessionManager({
    scpiFactory: async () => ({ scpi: fake.session, port: fake.session }),
  });

  const removed: string[] = [];
  manager.on("removed", ({ id }) => removed.push(id));

  const initial = manager.open({ host: "10.0.0.3" });
  await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "connected",
  );
  await manager.close(initial.id);
  assert.equal(manager.get(initial.id), null);
  assert.deepEqual(removed, [initial.id]);
  assert.equal(fake.closed, true);
});

test("max sessions cap rejects further opens", () => {
  const fake = makeFakeScpi().onQueryIdn("RIGOL,DHO804,SN,FW");
  const manager = new SessionManager({
    maxSessions: 1,
    scpiFactory: async () => ({ scpi: fake.session, port: fake.session }),
  });
  manager.open({ host: "a" });
  assert.throws(() => manager.open({ host: "b" }), /limit/);
});
