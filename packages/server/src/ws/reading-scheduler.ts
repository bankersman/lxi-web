import type {
  IMultimeter,
  IOscilloscope,
  IPowerSupply,
  ReadingTopic,
  ServerMessage,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

/**
 * Per-topic cadence for server-side read loops. Matches (and in some cases
 * relaxes) the legacy per-component HTTP polling intervals: the loop runs
 * once per session even when multiple UI panels are mounted, so we can
 * afford a slightly faster tick on the fast paths without increasing
 * instrument load.
 */
const TOPIC_INTERVAL_MS: Readonly<Record<ReadingTopic, number>> = {
  "dmm.reading": 750,
  "dmm.dualReading": 1000,
  "psu.channels": 1500,
  "psu.tracking": 3000,
  "psu.protection": 3000,
  "scope.channels": 3000,
  "scope.timebase": 3000,
};

interface Subscriber {
  send(message: ServerMessage): void;
}

interface Loop {
  readonly key: string;
  readonly sessionId: string;
  readonly topic: ReadingTopic;
  readonly subscribers: Set<Subscriber>;
  /** Most recent successful payload, replayed immediately to new subscribers. */
  lastPayload: { value: unknown; measuredAt: number } | null;
  /** Most recent error message, replayed immediately to new subscribers. */
  lastError: { message: string; at: number } | null;
  inFlight: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

const keyOf = (sessionId: string, topic: ReadingTopic): string =>
  `${sessionId}::${topic}`;

/**
 * Reference-counted scheduler that runs one loop per `(sessionId, topic)` and
 * fan-outs each successful read to every currently-subscribed WebSocket.
 *
 * - First subscribe starts the loop and immediately kicks off a read.
 * - Last unsubscribe (or socket drop) stops the loop and forgets the cache.
 * - Errors are broadcast but the loop keeps ticking so a transient instrument
 *   hiccup doesn't tear down everyone's live view.
 */
export class ReadingScheduler {
  readonly #loops = new Map<string, Loop>();
  readonly #manager: SessionManager;

  constructor(manager: SessionManager) {
    this.#manager = manager;
  }

  subscribe(
    sessionId: string,
    topic: ReadingTopic,
    subscriber: Subscriber,
  ): void {
    const key = keyOf(sessionId, topic);
    let loop = this.#loops.get(key);
    if (!loop) {
      loop = {
        key,
        sessionId,
        topic,
        subscribers: new Set(),
        lastPayload: null,
        lastError: null,
        inFlight: false,
        timer: null,
      };
      this.#loops.set(key, loop);
    }
    loop.subscribers.add(subscriber);

    if (loop.lastPayload) {
      subscriber.send({
        type: "reading:update",
        sessionId,
        topic,
        payload: loop.lastPayload.value,
        measuredAt: loop.lastPayload.measuredAt,
      });
    } else if (loop.lastError) {
      subscriber.send({
        type: "reading:error",
        sessionId,
        topic,
        message: loop.lastError.message,
        at: loop.lastError.at,
      });
    }

    if (!loop.timer) {
      const tick = (): void => void this.#tick(loop!);
      loop.timer = setInterval(tick, TOPIC_INTERVAL_MS[topic]);
      void this.#tick(loop);
    }
  }

  unsubscribe(
    sessionId: string,
    topic: ReadingTopic,
    subscriber: Subscriber,
  ): void {
    const loop = this.#loops.get(keyOf(sessionId, topic));
    if (!loop) return;
    loop.subscribers.delete(subscriber);
    if (loop.subscribers.size === 0) this.#stop(loop);
  }

  /** Drop every subscription belonging to `subscriber` (called on socket close). */
  removeSubscriber(subscriber: Subscriber): void {
    for (const loop of this.#loops.values()) {
      if (loop.subscribers.delete(subscriber) && loop.subscribers.size === 0) {
        this.#stop(loop);
      }
    }
  }

  /** Stop every scheduler loop associated with `sessionId` (called on session close). */
  removeSession(sessionId: string): void {
    for (const loop of this.#loops.values()) {
      if (loop.sessionId === sessionId) this.#stop(loop);
    }
  }

  #stop(loop: Loop): void {
    if (loop.timer) clearInterval(loop.timer);
    this.#loops.delete(loop.key);
  }

  async #tick(loop: Loop): Promise<void> {
    if (loop.inFlight) return;
    if (!this.#loops.has(loop.key)) return;
    loop.inFlight = true;
    try {
      const payload = await this.#read(loop.sessionId, loop.topic);
      if (!this.#loops.has(loop.key)) return;
      const measuredAt = Date.now();
      loop.lastPayload = { value: payload, measuredAt };
      loop.lastError = null;
      this.#broadcast(loop, {
        type: "reading:update",
        sessionId: loop.sessionId,
        topic: loop.topic,
        payload,
        measuredAt,
      });
    } catch (err) {
      if (!this.#loops.has(loop.key)) return;
      const message = err instanceof Error ? err.message : String(err);
      const at = Date.now();
      loop.lastError = { message, at };
      this.#broadcast(loop, {
        type: "reading:error",
        sessionId: loop.sessionId,
        topic: loop.topic,
        message,
        at,
      });
    } finally {
      loop.inFlight = false;
    }
  }

  #broadcast(loop: Loop, message: ServerMessage): void {
    for (const s of loop.subscribers) {
      try {
        s.send(message);
      } catch {
        /* caller's problem; we'll remove them on close */
      }
    }
  }

  async #read(sessionId: string, topic: ReadingTopic): Promise<unknown> {
    const facade = this.#manager.getFacade(sessionId);
    if (!facade) throw new Error(`session ${sessionId} is not open`);

    switch (topic) {
      case "dmm.reading": {
        if (facade.kind !== "multimeter") {
          throw new Error("session is not a multimeter");
        }
        return await (facade as IMultimeter).read();
      }
      case "dmm.dualReading": {
        if (facade.kind !== "multimeter") {
          throw new Error("session is not a multimeter");
        }
        const dmm = facade as IMultimeter;
        if (!dmm.readDual) throw new Error("dual display not supported");
        return await dmm.readDual();
      }
      case "psu.channels": {
        if (facade.kind !== "powerSupply") {
          throw new Error("session is not a power supply");
        }
        return await (facade as IPowerSupply).getChannels();
      }
      case "psu.tracking": {
        if (facade.kind !== "powerSupply") {
          throw new Error("session is not a power supply");
        }
        const psu = facade as IPowerSupply;
        if (!psu.tracking || !psu.getTracking) {
          return { supported: false, channels: [], enabled: false };
        }
        return {
          supported: true,
          channels: psu.tracking.channels,
          enabled: await psu.getTracking(),
        };
      }
      case "psu.protection": {
        if (facade.kind !== "powerSupply") {
          throw new Error("session is not a power supply");
        }
        const psu = facade as IPowerSupply;
        if (!psu.protection || !psu.getProtection) {
          return { supported: false, channels: [] };
        }
        const getProtection = psu.getProtection.bind(psu);
        // Serialise per-channel fetches so the SCPI queue doesn't pair up
        // several `*.PROT?` queries against a driver that hates concurrent
        // queries; the topic's 3 s cadence leaves plenty of budget.
        const channels: Array<{
          channel: number;
          ovp: unknown;
          ocp: unknown;
        }> = [];
        for (const ch of psu.protection.channels) {
          const [ovp, ocp] = await Promise.all([
            getProtection(ch, "ovp"),
            getProtection(ch, "ocp"),
          ]);
          channels.push({ channel: ch, ovp, ocp });
        }
        return { supported: true, channels };
      }
      case "scope.channels": {
        if (facade.kind !== "oscilloscope") {
          throw new Error("session is not an oscilloscope");
        }
        return await (facade as IOscilloscope).getChannels();
      }
      case "scope.timebase": {
        if (facade.kind !== "oscilloscope") {
          throw new Error("session is not an oscilloscope");
        }
        return await (facade as IOscilloscope).getTimebase();
      }
    }
  }
}
