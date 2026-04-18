import { randomUUID } from "node:crypto";
import {
  DEFAULT_SCPI_PORT,
  DriverRegistry,
  ScpiSession,
  TcpTransport,
  createDefaultRegistry,
  createSystErrErrorQueue,
  parseIdn,
  runAsyncWithTranscriptOrigin,
  type DeviceErrorEntry,
  type DeviceIdentity,
  type DeviceKind,
  type DriverEntry,
  type InstrumentFacade,
  type OutputKillResult,
  type PanicResult,
  type ScpiPort,
  type ScpiSessionOptions,
  type SessionStatus,
  type SessionSummary,
  type TranscriptRecordInput,
  type TranscriptSink,
} from "@lxi-web/core";
import { TypedEmitter } from "./emitter.js";
import { DeviceErrorRing, TranscriptRing } from "./ring-buffers.js";

export interface SessionManagerOptions {
  /** Cap on concurrent sessions. Default 16 (plenty for one bench). */
  readonly maxSessions?: number;
  /** Custom driver registry (mostly for tests). */
  readonly registry?: DriverRegistry;
  /**
   * Factory for the low-level SCPI session. Swapped in tests with a fake
   * that never touches a real TCP socket.
   */
  readonly scpiFactory?: (options: OpenOptions & ScpiFactoryExtras) => Promise<{
    readonly scpi: import("@lxi-web/core").ScpiSession;
    readonly port: ScpiPort;
  }>;
  readonly transcriptRingMax?: number;
  readonly deviceErrorRingMax?: number;
  /** Per-instrument wall time for `disableAllOutputs` during panic. Default 500 ms. */
  readonly panicTimeoutMs?: number;
  /** Ring buffer size for `GET /api/panic/history`. Default 20. */
  readonly panicHistoryMax?: number;
}

export interface OpenOptions {
  readonly host: string;
  readonly port?: number;
}

export interface ScpiFactoryExtras {
  readonly transcriptSink?: TranscriptSink;
  readonly scpiOptions?: Omit<ScpiSessionOptions, "transcriptSink">;
}

type SessionEvents = {
  update: [SessionSummary];
  removed: [{ id: string }];
  deviceErrors: [{ sessionId: string; entries: DeviceErrorEntry[] }];
  transcript: [{ sessionId: string; entries: import("@lxi-web/core").TranscriptEntry[] }];
  panicComplete: [PanicResult];
};

interface InternalSession {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly openedAt: number;
  status: SessionStatus;
  kind: DeviceKind;
  identity: DeviceIdentity | null;
  driverId: string | null;
  facade: InstrumentFacade | null;
  scpi: import("@lxi-web/core").ScpiSession | null;
  error: string | null;
  disposeCloseListener: (() => void) | null;
  transcriptRing: TranscriptRing | null;
  deviceErrorRing: DeviceErrorRing | null;
  disposeErrorPoller: (() => void) | null;
}

export class SessionManager {
  readonly #emitter = new TypedEmitter<SessionEvents>();
  readonly #sessions = new Map<string, InternalSession>();
  readonly #registry: DriverRegistry;
  readonly #maxSessions: number;
  readonly #scpiFactory: NonNullable<SessionManagerOptions["scpiFactory"]>;
  readonly #transcriptRingMax: number;
  readonly #deviceErrorRingMax: number;
  readonly #panicTimeoutMs: number;
  readonly #panicHistoryMax: number;
  readonly #panicHistory: PanicResult[] = [];

  constructor(options: SessionManagerOptions = {}) {
    this.#registry = options.registry ?? createDefaultRegistry();
    this.#maxSessions = options.maxSessions ?? 16;
    this.#scpiFactory = options.scpiFactory ?? defaultScpiFactory;
    this.#transcriptRingMax =
      options.transcriptRingMax ??
      (Number(process.env.LXI_TRANSCRIPT_RING_MAX) || 2000);
    this.#deviceErrorRingMax =
      options.deviceErrorRingMax ??
      (Number(process.env.LXI_DEVICE_ERROR_RING_MAX) || 200);
    this.#panicTimeoutMs =
      options.panicTimeoutMs ?? (Number(process.env.LXI_PANIC_TIMEOUT_MS) || 500);
    this.#panicHistoryMax = options.panicHistoryMax ?? 20;
  }

  on<K extends keyof SessionEvents>(
    event: K,
    listener: (...args: SessionEvents[K]) => void,
  ): () => void {
    return this.#emitter.on(event, listener);
  }

  list(): SessionSummary[] {
    return [...this.#sessions.values()].map(toSummary);
  }

  get(id: string): SessionSummary | null {
    const session = this.#sessions.get(id);
    return session ? toSummary(session) : null;
  }

  getFacade(id: string): InstrumentFacade | null {
    return this.#sessions.get(id)?.facade ?? null;
  }

  getDeviceErrors(id: string): DeviceErrorEntry[] | null {
    const s = this.#sessions.get(id);
    if (!s?.deviceErrorRing) return null;
    return s.deviceErrorRing.snapshot();
  }

  clearDeviceErrors(id: string): boolean {
    const s = this.#sessions.get(id);
    if (!s?.deviceErrorRing) return false;
    s.deviceErrorRing.clear();
    return true;
  }

  getTranscriptSince(
    id: string,
    sinceSeq: number,
    limit: number,
  ): import("@lxi-web/core").TranscriptEntry[] | null {
    const s = this.#sessions.get(id);
    if (!s?.transcriptRing) return null;
    return s.transcriptRing.getSince(sinceSeq, limit);
  }

  transcriptMaxSeq(id: string): number | null {
    const s = this.#sessions.get(id);
    if (!s?.transcriptRing) return null;
    return s.transcriptRing.maxSeq;
  }

  iterateTranscriptExport(
    id: string,
  ): Iterable<import("@lxi-web/core").TranscriptEntry> | null {
    const s = this.#sessions.get(id);
    if (!s?.transcriptRing) return null;
    return s.transcriptRing.allInOrder();
  }

  /**
   * Open a new session. Returns the initial `"connecting"` summary right
   * away; the connect + identify + driver resolution happen in the
   * background and emit `update` events for each transition.
   */
  open(options: OpenOptions): SessionSummary {
    if (this.#sessions.size >= this.#maxSessions) {
      throw new Error(`session limit reached (${this.#maxSessions})`);
    }
    const internal: InternalSession = {
      id: randomUUID(),
      host: options.host,
      port: options.port ?? DEFAULT_SCPI_PORT,
      openedAt: Date.now(),
      status: "connecting",
      kind: "unknown",
      identity: null,
      driverId: null,
      facade: null,
      scpi: null,
      error: null,
      disposeCloseListener: null,
      transcriptRing: null,
      deviceErrorRing: null,
      disposeErrorPoller: null,
    };
    this.#sessions.set(internal.id, internal);
    const summary = toSummary(internal);
    this.#emitter.emit("update", summary);

    void this.#establish(internal);
    return summary;
  }

  reconnect(id: string): SessionSummary | null {
    const session = this.#sessions.get(id);
    if (!session) return null;
    if (session.status === "connecting") return toSummary(session);
    if (session.status === "connected") return toSummary(session);

    session.status = "connecting";
    session.error = null;
    session.identity = null;
    session.driverId = null;
    session.kind = "unknown";
    session.facade = null;
    session.scpi = null;
    session.transcriptRing = null;
    session.deviceErrorRing = null;
    if (session.disposeCloseListener) {
      session.disposeCloseListener();
      session.disposeCloseListener = null;
    }
    if (session.disposeErrorPoller) {
      session.disposeErrorPoller();
      session.disposeErrorPoller = null;
    }

    const summary = toSummary(session);
    this.#emitter.emit("update", summary);
    void this.#establish(session);
    return summary;
  }

  async close(id: string): Promise<void> {
    const session = this.#sessions.get(id);
    if (!session) return;
    this.#sessions.delete(id);
    if (session.disposeCloseListener) {
      session.disposeCloseListener();
      session.disposeCloseListener = null;
    }
    if (session.disposeErrorPoller) {
      session.disposeErrorPoller();
      session.disposeErrorPoller = null;
    }
    if (session.scpi) {
      try {
        await session.scpi.close();
      } catch {
        // Swallow close errors; the dashboard already removed the card.
      }
    }
    this.#emitter.emit("removed", { id });
  }

  async closeAll(): Promise<void> {
    const ids = [...this.#sessions.keys()];
    await Promise.all(ids.map((id) => this.close(id)));
  }

  /** Send a raw SCPI command (for the Unknown-device escape hatch). */
  async sendRaw(
    id: string,
    command: string,
    expectReply: boolean,
  ): Promise<string | null> {
    const session = this.#sessions.get(id);
    if (!session || !session.scpi) {
      throw new Error(`session ${id} is not open`);
    }
    return runAsyncWithTranscriptOrigin({ kind: "rawScpi" }, async () => {
      if (expectReply) return session.scpi!.query(command);
      await session.scpi!.write(command);
      return null;
    });
  }

  /** Append a synthetic transcript line (e.g. Epic 5.2 panic). */
  appendTranscript(id: string, input: TranscriptRecordInput): boolean {
    const session = this.#sessions.get(id);
    if (!session?.transcriptRing) return false;
    const e = session.transcriptRing.push(input);
    this.#emitter.emit("transcript", { sessionId: id, entries: [e] });
    return true;
  }

  /** Last panic invocations (oldest → newest), capped at {@link SessionManagerOptions.panicHistoryMax}. */
  getPanicHistory(): readonly PanicResult[] {
    return [...this.#panicHistory];
  }

  /**
   * Disable outputs on every connected session whose façade implements
   * `disableAllOutputs`, in parallel with a per-session timeout. SCPI during
   * each kill is tagged with transcript origin `{ kind: "panic" }`.
   */
  async panic(options?: { readonly timeoutMs?: number }): Promise<PanicResult> {
    const startedAt = new Date().toISOString();
    const timeoutMs = options?.timeoutMs ?? this.#panicTimeoutMs;
    const touchedSessions: PanicResult["touchedSessions"][number][] = [];
    const skippedSessions: PanicResult["skippedSessions"][number][] = [];

    const killable: InternalSession[] = [];
    for (const session of this.#sessions.values()) {
      if (session.status !== "connected") {
        skippedSessions.push({
          sessionId: session.id,
          reason: "session-not-connected",
        });
        continue;
      }
      if (!isOutputKillableFacade(session.facade)) {
        skippedSessions.push({
          sessionId: session.id,
          reason: "not-output-killable",
        });
        continue;
      }
      killable.push(session);
    }

    const outcomes = await Promise.all(
      killable.map((session) => this.#panicOneSession(session, timeoutMs)),
    );
    touchedSessions.push(...outcomes);

    const finishedAt = new Date().toISOString();
    const result: PanicResult = {
      startedAt,
      finishedAt,
      touchedSessions,
      skippedSessions,
    };

    this.#panicHistory.push(result);
    while (this.#panicHistory.length > this.#panicHistoryMax) {
      this.#panicHistory.shift();
    }
    this.#emitter.emit("panicComplete", result);
    return result;
  }

  async #panicOneSession(
    session: InternalSession,
    timeoutMs: number,
  ): Promise<PanicResult["touchedSessions"][number]> {
    const facade = session.facade as InstrumentFacade & {
      disableAllOutputs(): Promise<OutputKillResult>;
    };
    const idn = session.identity?.raw ?? "unknown";
    const t0 = performance.now();
    try {
      const outcome = await withTimeout(
        runAsyncWithTranscriptOrigin({ kind: "panic" }, () => facade.disableAllOutputs()),
        timeoutMs,
      );
      const elapsedMs = Math.round(performance.now() - t0);
      return { sessionId: session.id, idn, outcome, elapsedMs };
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      return {
        sessionId: session.id,
        idn,
        outcome: {
          kind: "error",
          touched: [],
          errors: [{ target: "panic", message }],
        },
        elapsedMs,
      };
    }
  }

  async #establish(session: InternalSession): Promise<void> {
    const transcriptRing = new TranscriptRing(this.#transcriptRingMax);
    const deviceErrorRing = new DeviceErrorRing(this.#deviceErrorRingMax);

    const sink: TranscriptSink = {
      record: (r: TranscriptRecordInput) => {
        const e = transcriptRing.push(r);
        this.#emitter.emit("transcript", { sessionId: session.id, entries: [e] });
      },
    };

    try {
      const { scpi, port } = await this.#scpiFactory({
        host: session.host,
        port: session.port,
        transcriptSink: sink,
      });
      if (!this.#sessions.has(session.id)) {
        await scpi.close();
        return;
      }
      session.scpi = scpi;
      session.transcriptRing = transcriptRing;
      session.deviceErrorRing = deviceErrorRing;

      const idnRaw = await scpi.query("*IDN?", { timeoutMs: 5_000 });
      if (!this.#sessions.has(session.id)) {
        await scpi.close();
        return;
      }
      const identity = parseIdn(idnRaw);
      session.identity = identity;

      const driver = this.#registry.resolve(identity);
      if (driver) {
        session.driverId = driver.id;
        session.kind = driver.kind;
        let create = driver.create;
        if (driver.refine) {
          try {
            create = await driver.refine(port, identity);
          } catch {
            create = driver.create;
          }
        }
        if (!this.#sessions.has(session.id)) {
          await scpi.close();
          return;
        }
        session.facade = create(port, identity) as InstrumentFacade;
      } else {
        session.driverId = null;
        session.kind = "unknown";
        session.facade = null;
      }
      session.status = "connected";
      session.disposeCloseListener = scpi.onClose((err) => {
        this.#handleUnexpectedClose(session, err);
      });

      if (session.kind !== "unknown") {
        const eq = createSystErrErrorQueue(port);
        let busy = false;
        const timer = setInterval(() => {
          void (async () => {
            if (busy) return;
            if (!this.#sessions.has(session.id)) return;
            if (session.status !== "connected") return;
            busy = true;
            try {
              await runAsyncWithTranscriptOrigin({ kind: "errorQueue" }, async () => {
                const entries = await eq.drain();
                if (entries.length === 0) return;
                const ring = session.deviceErrorRing;
                if (!ring) return;
                ring.pushMany(entries);
                this.#emitter.emit("deviceErrors", {
                  sessionId: session.id,
                  entries,
                });
              });
            } finally {
              busy = false;
            }
          })();
        }, eq.pollIntervalMs);
        if (typeof timer.unref === "function") timer.unref();
        session.disposeErrorPoller = () => {
          clearInterval(timer);
          session.disposeErrorPoller = null;
        };
      }

      this.#emitter.emit("update", toSummary(session));
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
      if (session.scpi) {
        try {
          await session.scpi.close();
        } catch {
          /* ignore */
        }
        session.scpi = null;
      }
      session.transcriptRing = null;
      session.deviceErrorRing = null;
      if (session.disposeCloseListener) {
        session.disposeCloseListener();
        session.disposeCloseListener = null;
      }
      if (session.disposeErrorPoller) {
        session.disposeErrorPoller();
        session.disposeErrorPoller = null;
      }
      this.#emitter.emit("update", toSummary(session));
    }
  }

  #handleUnexpectedClose(session: InternalSession, err?: Error): void {
    if (!this.#sessions.has(session.id)) return;
    if (session.status !== "connected") return;
    session.status = "error";
    session.error = err?.message ?? "connection lost";
    session.facade = null;
    session.scpi = null;
    session.transcriptRing = null;
    session.deviceErrorRing = null;
    if (session.disposeCloseListener) {
      session.disposeCloseListener();
      session.disposeCloseListener = null;
    }
    if (session.disposeErrorPoller) {
      session.disposeErrorPoller();
      session.disposeErrorPoller = null;
    }
    this.#emitter.emit("update", toSummary(session));
  }
}

function toSummary(session: InternalSession): SessionSummary {
  return {
    id: session.id,
    host: session.host,
    port: session.port,
    status: session.status,
    kind: session.kind,
    identity: session.identity,
    driverId: session.driverId,
    openedAt: session.openedAt,
    error: session.error !== null ? { message: session.error } : null,
  };
}

async function defaultScpiFactory(
  options: OpenOptions & ScpiFactoryExtras,
): Promise<{
  scpi: import("@lxi-web/core").ScpiSession;
  port: ScpiPort;
}> {
  const transport = new TcpTransport({
    host: options.host,
    port: options.port ?? DEFAULT_SCPI_PORT,
    connectTimeoutMs: 5_000,
  });
  await transport.connect();
  const extra = options.scpiOptions ?? {};
  const scpi = new ScpiSession(transport, {
    ...extra,
    transcriptSink: options.transcriptSink,
  });
  return { scpi, port: scpi };
}

export type { DriverEntry };

function isOutputKillableFacade(
  facade: InstrumentFacade | null,
): facade is InstrumentFacade & {
  disableAllOutputs(): Promise<OutputKillResult>;
} {
  return (
    facade !== null &&
    typeof (facade as { disableAllOutputs?: unknown }).disableAllOutputs === "function"
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("panic-timeout")), ms);
    if (typeof timer.unref === "function") timer.unref();
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
