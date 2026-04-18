import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type {
  ClientMessage,
  ObservabilityTopic,
  ReadingTopic,
  ServerMessage,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";
import { ObservabilityScheduler } from "../ws/observability-scheduler.js";
import { ReadingScheduler } from "../ws/reading-scheduler.js";

const READING_TOPICS = new Set<string>([
  "dmm.reading",
  "dmm.dualReading",
  "psu.channels",
  "psu.tracking",
  "psu.protection",
  "scope.channels",
  "scope.timebase",
  "eload.measurement",
  "eload.state",
  "sg.channels",
  "sa.markers",
  "sa.trace",
]);

function isReadingTopic(t: string): t is ReadingTopic {
  return READING_TOPICS.has(t);
}

function isObservabilityTopic(t: string): t is ObservabilityTopic {
  return t === "device.errors" || t === "session.transcript";
}

/**
 * The `/ws` endpoint serves two purposes:
 *
 * 1. **Session registry fan-out** — every connected client receives
 *    `sessions:init` on connect and then `sessions:update`/`sessions:removed`
 *    as the manager emits lifecycle events. This feeds the dashboard's
 *    live session list without any polling.
 *
 * 2. **Live reading subscriptions** — clients send
 *    `{ type: "subscribe", sessionId, topic }` to opt in to a topic (e.g.
 *    `"dmm.reading"`). The {@link ReadingScheduler} runs a single server-side
 *    read loop per `(sessionId, topic)` regardless of how many panels have
 *    subscribed, and pushes `reading:update` / `reading:error` frames to all
 *    subscribers. Sockets are auto-unsubscribed on disconnect.
 *
 * See `docs/steps/2-8-websocket-live-readings.md` for the full protocol and
 * how to add a new topic.
 */
export async function registerWebsocketRoute(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const clients = new Set<WebSocket>();
  const scheduler = new ReadingScheduler(manager);
  const observability = new ObservabilityScheduler(manager);

  const broadcast = (message: ServerMessage): void => {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === 1 /* OPEN */) client.send(payload);
    }
  };

  manager.on("update", (session) => broadcast({ type: "sessions:update", session }));
  manager.on("panicComplete", (result) => {
    const at = Date.now();
    for (const row of result.touchedSessions) {
      broadcast({
        type: "session.event",
        sessionId: row.sessionId,
        kind: "panicStop",
        idn: row.idn,
        outcome: row.outcome,
        elapsedMs: row.elapsedMs,
        at,
      });
    }
    broadcast({ type: "panic:complete", result, at });
  });
  manager.on("removed", ({ id }) => {
    scheduler.removeSession(id);
    observability.removeSession(id);
    broadcast({ type: "sessions:removed", id });
  });

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);

    const subscriber = {
      send(message: ServerMessage): void {
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(JSON.stringify(message));
        }
      },
    };

    const subscriptions = new Set<string>();

    socket.send(
      JSON.stringify({
        type: "sessions:init",
        sessions: manager.list(),
      } satisfies ServerMessage),
    );

    socket.on("message", (raw) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (parsed.type === "subscribe") {
        const key = `${parsed.sessionId}::${parsed.topic}`;
        if (subscriptions.has(key)) return;
        subscriptions.add(key);
        if (isObservabilityTopic(parsed.topic)) {
          observability.subscribe(parsed.sessionId, parsed.topic, subscriber);
        } else if (isReadingTopic(parsed.topic)) {
          scheduler.subscribe(parsed.sessionId, parsed.topic, subscriber);
        }
      } else if (parsed.type === "unsubscribe") {
        const key = `${parsed.sessionId}::${parsed.topic}`;
        if (!subscriptions.delete(key)) return;
        if (isObservabilityTopic(parsed.topic)) {
          observability.unsubscribe(parsed.sessionId, parsed.topic, subscriber);
        } else if (isReadingTopic(parsed.topic)) {
          scheduler.unsubscribe(parsed.sessionId, parsed.topic, subscriber);
        }
      }
    });

    const cleanup = (): void => {
      clients.delete(socket);
      scheduler.removeSubscriber(subscriber);
      observability.removeSubscriber(subscriber);
      subscriptions.clear();
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
}
