import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import type { ScpiSession, ServerMessage, SessionSummary } from "@lxi-web/core";
import { buildServer } from "../src/server.js";
import { SessionManager } from "../src/sessions/manager.js";

function fakeScpi(idn: string): ScpiSession {
  const closeListeners = new Set<(err?: Error) => void>();
  return {
    async query(cmd: string): Promise<string> {
      if (cmd === "*IDN?") return idn;
      return "";
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async close(): Promise<void> {},
    onClose(listener: (err?: Error) => void) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    get closed() {
      return false;
    },
  } as unknown as ScpiSession;
}

test("websocket broadcasts session init and updates", async () => {
  const manager = new SessionManager({
    scpiFactory: async () => {
      const s = fakeScpi("RIGOL,DHO804,SN,FW");
      return { scpi: s, port: s };
    },
  });
  const app = await buildServer({ logger: false, manager });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const addr = app.server.address();
  if (!addr || typeof addr === "string") throw new Error("no addr");
  const url = `ws://127.0.0.1:${addr.port}/ws`;

  const received: ServerMessage[] = [];
  const ws = new WebSocket(url);
  ws.on("message", (data) => {
    received.push(JSON.parse(String(data)) as ServerMessage);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  // Wait for init frame
  await waitFor(() => received.some((m) => m.type === "sessions:init"));
  const init = received.find((m) => m.type === "sessions:init")! as Extract<
    ServerMessage,
    { type: "sessions:init" }
  >;
  assert.deepEqual(init.sessions, []);

  const summary = manager.open({ host: "10.0.0.5" });
  await waitFor(() =>
    received.some(
      (m): m is Extract<ServerMessage, { type: "sessions:update" }> =>
        m.type === "sessions:update" && m.session.status === "connected",
    ),
  );
  const connected = received.find(
    (m): m is Extract<ServerMessage, { type: "sessions:update" }> =>
      m.type === "sessions:update" && m.session.status === "connected",
  )!;
  assert.equal(connected.session.kind, "oscilloscope");

  await manager.close(summary.id);
  await waitFor(() =>
    received.some(
      (m): m is Extract<ServerMessage, { type: "sessions:removed" }> =>
        m.type === "sessions:removed" && m.id === summary.id,
    ),
  );

  ws.close();
  await new Promise<void>((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once("close", () => resolve());
  });
  await app.close();
});

async function waitFor(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timeout");
}

// Keep reference so ws is not GC'd prematurely in the type-only check above.
void ({} as SessionSummary);
