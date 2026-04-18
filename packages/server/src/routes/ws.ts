import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { ServerMessage } from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

/**
 * Broadcast every lifecycle event to every connected WebSocket client. The
 * single-operator bench tool doesn't need fine-grained per-session
 * subscriptions — clients filter on the sessionId they care about.
 */
export async function registerWebsocketRoute(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const clients = new Set<WebSocket>();

  const broadcast = (message: ServerMessage): void => {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === 1 /* OPEN */) client.send(payload);
    }
  };

  manager.on("update", (session) => broadcast({ type: "sessions:update", session }));
  manager.on("removed", ({ id }) => broadcast({ type: "sessions:removed", id }));

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    const hello: ServerMessage = {
      type: "sessions:init",
      sessions: manager.list(),
    };
    socket.send(JSON.stringify(hello));
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });
}
