import type {
  DeviceErrorEntry,
  ServerMessage,
  TranscriptEntry,
} from "@lxi-web/core";
interface Subscriber {
  send(message: ServerMessage): void;
}

const keyOf = (sessionId: string, topic: "device.errors" | "session.transcript"): string =>
  `${sessionId}::${topic}`;

/**
 * Debounced fan-out for `device.errors` (250 ms) and `session.transcript`
 * (100 ms) so bursty SCPI traffic does not flood WebSocket clients.
 */
export class ObservabilityScheduler {
  readonly #devicePending = new Map<string, DeviceErrorEntry[]>();
  readonly #transcriptPending = new Map<string, TranscriptEntry[]>();
  readonly #deviceLoops = new Map<string, { subscribers: Set<Subscriber>; timer: ReturnType<typeof setTimeout> | null }>();
  readonly #transcriptLoops = new Map<string, { subscribers: Set<Subscriber>; timer: ReturnType<typeof setTimeout> | null }>();

  constructor(manager: import("../sessions/manager.js").SessionManager) {
    manager.on("deviceErrors", ({ sessionId, entries }) => {
      let batch = this.#devicePending.get(sessionId);
      if (!batch) {
        batch = [];
        this.#devicePending.set(sessionId, batch);
      }
      batch.push(...entries);
      this.#scheduleDeviceFlush(sessionId);
    });
    manager.on("transcript", ({ sessionId, entries }) => {
      let batch = this.#transcriptPending.get(sessionId);
      if (!batch) {
        batch = [];
        this.#transcriptPending.set(sessionId, batch);
      }
      batch.push(...entries);
      this.#scheduleTranscriptFlush(sessionId);
    });
  }

  subscribe(
    sessionId: string,
    topic: "device.errors" | "session.transcript",
    subscriber: Subscriber,
  ): void {
    const map = topic === "device.errors" ? this.#deviceLoops : this.#transcriptLoops;
    const key = keyOf(sessionId, topic);
    let loop = map.get(key);
    if (!loop) {
      loop = { subscribers: new Set(), timer: null };
      map.set(key, loop);
    }
    loop.subscribers.add(subscriber);
    if (topic === "device.errors") {
      const pending = this.#devicePending.get(sessionId);
      if (pending?.length) this.#scheduleDeviceFlush(sessionId);
    } else {
      const pending = this.#transcriptPending.get(sessionId);
      if (pending?.length) this.#scheduleTranscriptFlush(sessionId);
    }
  }

  unsubscribe(
    sessionId: string,
    topic: "device.errors" | "session.transcript",
    subscriber: Subscriber,
  ): void {
    const map = topic === "device.errors" ? this.#deviceLoops : this.#transcriptLoops;
    const key = keyOf(sessionId, topic);
    const loop = map.get(key);
    if (!loop) return;
    loop.subscribers.delete(subscriber);
    if (loop.subscribers.size === 0) {
      if (loop.timer) clearTimeout(loop.timer);
      map.delete(key);
    }
  }

  removeSubscriber(subscriber: Subscriber): void {
    for (const map of [this.#deviceLoops, this.#transcriptLoops]) {
      for (const [key, loop] of map) {
        if (loop.subscribers.delete(subscriber) && loop.subscribers.size === 0) {
          if (loop.timer) clearTimeout(loop.timer);
          map.delete(key);
        }
      }
    }
  }

  removeSession(sessionId: string): void {
    for (const topic of ["device.errors", "session.transcript"] as const) {
      const map =
        topic === "device.errors" ? this.#deviceLoops : this.#transcriptLoops;
      const loop = map.get(keyOf(sessionId, topic));
      if (loop?.timer) clearTimeout(loop.timer);
      map.delete(keyOf(sessionId, topic));
    }
    this.#devicePending.delete(sessionId);
    this.#transcriptPending.delete(sessionId);
  }

  #scheduleDeviceFlush(sessionId: string): void {
    const key = keyOf(sessionId, "device.errors");
    const loop = this.#deviceLoops.get(key);
    if (!loop || loop.subscribers.size === 0) return;
    if (loop.timer) return;
    loop.timer = setTimeout(() => {
      loop.timer = null;
      const entries = this.#devicePending.get(sessionId);
      if (!entries || entries.length === 0) return;
      this.#devicePending.delete(sessionId);
      const at = Date.now();
      const msg: ServerMessage = {
        type: "deviceErrors:batch",
        sessionId,
        entries,
        at,
      };
      for (const s of loop.subscribers) s.send(msg);
    }, 250);
  }

  #scheduleTranscriptFlush(sessionId: string): void {
    const key = keyOf(sessionId, "session.transcript");
    const loop = this.#transcriptLoops.get(key);
    if (!loop || loop.subscribers.size === 0) return;
    if (loop.timer) return;
    loop.timer = setTimeout(() => {
      loop.timer = null;
      const entries = this.#transcriptPending.get(sessionId);
      if (!entries || entries.length === 0) return;
      this.#transcriptPending.delete(sessionId);
      const at = Date.now();
      const msg: ServerMessage = {
        type: "sessionTranscript:batch",
        sessionId,
        entries,
        at,
      };
      for (const s of loop.subscribers) s.send(msg);
    }, 100);
  }
}
