import test from "node:test";
import assert from "node:assert/strict";
import type { ScpiSession, SessionSummary } from "@lxi-web/core";
import { SessionManager } from "../src/sessions/manager.js";

interface FakeScpi {
  onQueryIdn(reply: string): FakeScpi;
  onQueryFails(err: Error): FakeScpi;
  session: ScpiSession;
  closed: boolean;
  /** Simulate an unexpected transport drop. */
  triggerClose(err?: Error): void;
}

function makeFakeScpi(): FakeScpi {
  const closeListeners = new Set<(err?: Error) => void>();
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
      onClose(listener: (err?: Error) => void) {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
      get closed() {
        return state.closed;
      },
    } as unknown as ScpiSession,
    get closed() {
      return state.closed;
    },
    triggerClose(err) {
      for (const l of closeListeners) l(err);
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

test("unexpected transport drop flips the session to 'error' but keeps the id", async () => {
  const fake = makeFakeScpi().onQueryIdn("RIGOL TECHNOLOGIES,DHO804,SN,FW");
  const manager = new SessionManager({
    scpiFactory: async () => ({ scpi: fake.session, port: fake.session }),
  });

  const initial = manager.open({ host: "10.0.0.10" });
  await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "connected",
  );

  fake.triggerClose(new Error("socket closed by peer"));

  const afterDrop = await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "error",
  );
  assert.equal(afterDrop!.id, initial.id, "sessionId stays stable across a drop");
  assert.equal(afterDrop!.error?.message, "socket closed by peer");
});

test("reconnect re-establishes an errored session in place", async () => {
  let attempt = 0;
  const first = makeFakeScpi().onQueryFails(new Error("ECONNREFUSED"));
  const second = makeFakeScpi().onQueryIdn("RIGOL TECHNOLOGIES,DHO804,SN,FW");
  const manager = new SessionManager({
    scpiFactory: async () => {
      attempt += 1;
      const fake = attempt === 1 ? first : second;
      return { scpi: fake.session, port: fake.session };
    },
  });

  const initial = manager.open({ host: "10.0.0.11" });
  await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "error",
  );

  const again = manager.reconnect(initial.id);
  assert.ok(again);
  assert.equal(again!.id, initial.id);
  assert.equal(again!.status, "connecting");
  assert.equal(again!.error, null);

  const final = await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "connected",
  );
  assert.equal(final!.kind, "oscilloscope");
  assert.equal(attempt, 2);
});

test("reconnect is a no-op when the session is already connected", async () => {
  const fake = makeFakeScpi().onQueryIdn("RIGOL,DHO804,SN,FW");
  const manager = new SessionManager({
    scpiFactory: async () => ({ scpi: fake.session, port: fake.session }),
  });
  const initial = manager.open({ host: "10.0.0.12" });
  await waitFor(
    () => manager.get(initial.id),
    (s) => s?.status === "connected",
  );
  const summary = manager.reconnect(initial.id);
  assert.equal(summary?.status, "connected");
  assert.equal(summary?.id, initial.id);
});

test("reconnect on an unknown id returns null", () => {
  const manager = new SessionManager({
    scpiFactory: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(manager.reconnect("does-not-exist"), null);
});
