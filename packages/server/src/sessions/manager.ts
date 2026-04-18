import { randomUUID } from "node:crypto";
import {
  DEFAULT_SCPI_PORT,
  DriverRegistry,
  ScpiSession,
  TcpTransport,
  createDefaultRegistry,
  parseIdn,
  type DeviceIdentity,
  type DeviceKind,
  type DriverEntry,
  type InstrumentFacade,
  type ScpiPort,
  type SessionStatus,
  type SessionSummary,
} from "@lxi-web/core";
import { TypedEmitter } from "./emitter.js";

export interface SessionManagerOptions {
  /** Cap on concurrent sessions. Default 16 (plenty for one bench). */
  readonly maxSessions?: number;
  /** Custom driver registry (mostly for tests). */
  readonly registry?: DriverRegistry;
  /**
   * Factory for the low-level SCPI session. Swapped in tests with a fake
   * that never touches a real TCP socket.
   */
  readonly scpiFactory?: (options: OpenOptions) => Promise<{
    readonly scpi: ScpiSession;
    readonly port: ScpiPort;
  }>;
}

export interface OpenOptions {
  readonly host: string;
  readonly port?: number;
}

type SessionEvents = {
  update: [SessionSummary];
  removed: [{ id: string }];
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
  scpi: ScpiSession | null;
  error: string | null;
}

export class SessionManager {
  readonly #emitter = new TypedEmitter<SessionEvents>();
  readonly #sessions = new Map<string, InternalSession>();
  readonly #registry: DriverRegistry;
  readonly #maxSessions: number;
  readonly #scpiFactory: NonNullable<SessionManagerOptions["scpiFactory"]>;

  constructor(options: SessionManagerOptions = {}) {
    this.#registry = options.registry ?? createDefaultRegistry();
    this.#maxSessions = options.maxSessions ?? 16;
    this.#scpiFactory = options.scpiFactory ?? defaultScpiFactory;
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
    };
    this.#sessions.set(internal.id, internal);
    const summary = toSummary(internal);
    this.#emitter.emit("update", summary);

    void this.#establish(internal);
    return summary;
  }

  async close(id: string): Promise<void> {
    const session = this.#sessions.get(id);
    if (!session) return;
    this.#sessions.delete(id);
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
    if (expectReply) return session.scpi.query(command);
    await session.scpi.write(command);
    return null;
  }

  async #establish(session: InternalSession): Promise<void> {
    try {
      const { scpi, port } = await this.#scpiFactory({
        host: session.host,
        port: session.port,
      });
      if (!this.#sessions.has(session.id)) {
        // Removed while we were connecting — clean up and bail.
        await scpi.close();
        return;
      }
      session.scpi = scpi;

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
        session.facade = driver.create(port, identity) as InstrumentFacade;
      } else {
        session.driverId = null;
        session.kind = "unknown";
        session.facade = null;
      }
      session.status = "connected";
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
      this.#emitter.emit("update", toSummary(session));
    }
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

async function defaultScpiFactory(options: OpenOptions): Promise<{
  scpi: ScpiSession;
  port: ScpiPort;
}> {
  const transport = new TcpTransport({
    host: options.host,
    port: options.port ?? DEFAULT_SCPI_PORT,
    connectTimeoutMs: 5_000,
  });
  await transport.connect();
  const scpi = new ScpiSession(transport);
  return { scpi, port: scpi };
}

export type { DriverEntry };
