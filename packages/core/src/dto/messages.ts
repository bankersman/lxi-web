import type { SessionSummary } from "./session.js";

/**
 * Topics clients can subscribe to for live, push-based instrument state.
 * Each topic is fan-out per `{sessionId, topic}` — when at least one socket
 * is subscribed, the server runs a single scheduler loop against the
 * instrument and broadcasts the result to every subscriber. When the last
 * subscriber disconnects or unsubscribes, the loop stops.
 *
 * Only recurring, continuously-polled readings belong here; one-shot
 * reads, user commands, and capability queries stay on plain HTTP.
 */
export type ReadingTopic =
  | "dmm.reading"
  | "dmm.dualReading"
  | "psu.channels"
  | "psu.tracking"
  | "psu.protection"
  | "scope.channels"
  | "scope.timebase"
  | "eload.measurement"
  | "eload.state";

/** Server-to-client WebSocket message envelope. */
export type ServerMessage =
  | { type: "sessions:init"; sessions: readonly SessionSummary[] }
  | { type: "sessions:update"; session: SessionSummary }
  | { type: "sessions:removed"; id: string }
  | {
      type: "reading:update";
      sessionId: string;
      topic: ReadingTopic;
      /** Topic-specific payload. See server `reading-scheduler.ts` for per-topic shapes. */
      payload: unknown;
      /** Wall-clock ms when the server captured this value. */
      measuredAt: number;
    }
  | {
      type: "reading:error";
      sessionId: string;
      topic: ReadingTopic;
      message: string;
      /** Wall-clock ms of the failed attempt. */
      at: number;
    };

/** Client-to-server WebSocket message envelope. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "subscribe"; sessionId: string; topic: ReadingTopic }
  | { type: "unsubscribe"; sessionId: string; topic: ReadingTopic };
