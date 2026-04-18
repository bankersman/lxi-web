import type { SessionSummary } from "./session.js";

/** Server-to-client WebSocket message envelope. */
export type ServerMessage =
  | { type: "sessions:init"; sessions: readonly SessionSummary[] }
  | { type: "sessions:update"; session: SessionSummary }
  | { type: "sessions:removed"; id: string };

/** Client-to-server WebSocket message envelope (placeholder for v2). */
export type ClientMessage = { type: "ping" };
