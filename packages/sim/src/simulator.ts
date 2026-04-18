import { createServer, type Server, type Socket } from "node:net";
import { SimulatorSession } from "./session.js";
import type { SimulatorPersonality } from "./personality.js";

export interface SimulatorOptions {
  readonly personality: SimulatorPersonality;
  /** Base IDN; `{serial}` token is replaced with `serial` below. */
  readonly idnOverride?: string;
  readonly optOverride?: string;
  readonly serial?: string;
  readonly logger?: (msg: string) => void;
  /** Optional override for the ASCII terminator appended to replies. Default `\n`. */
  readonly terminator?: string;
}

export interface SimulatorListenOptions {
  readonly host?: string;
  readonly port: number;
}

/**
 * TCP SCPI simulator. One instance = one personality = one listener. The
 * CLI may spin up N simulators for a multi-instrument bench.
 */
export class Simulator {
  readonly #options: SimulatorOptions;
  readonly #server: Server;
  readonly #sessions = new Set<SimulatorSession>();
  readonly #terminator: Uint8Array;
  #listening = false;
  #port = 0;

  constructor(options: SimulatorOptions) {
    this.#options = options;
    this.#server = createServer((socket) => this.#onConnection(socket));
    this.#terminator = new TextEncoder().encode(options.terminator ?? "\n");
  }

  /** Actual bound port (useful when the caller passes `port: 0`). */
  get port(): number {
    return this.#port;
  }

  /** Personality powering this simulator (stable across sessions). */
  get personality(): SimulatorPersonality {
    return this.#options.personality;
  }

  get listening(): boolean {
    return this.#listening;
  }

  /** Start accepting TCP connections. Resolves once the server is listening. */
  listen(options: SimulatorListenOptions): Promise<void> {
    const { host = "127.0.0.1", port } = options;
    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        this.#server.off("error", onError);
        reject(err);
      };
      this.#server.once("error", onError);
      this.#server.listen(port, host, () => {
        this.#server.off("error", onError);
        const address = this.#server.address();
        if (address && typeof address !== "string") {
          this.#port = address.port;
        } else {
          this.#port = port;
        }
        this.#listening = true;
        this.#options.logger?.(
          `[${this.#options.personality.id}] listening on ${host}:${this.#port}`,
        );
        resolve();
      });
    });
  }

  /** Close the server and tear down all live sockets. */
  async close(): Promise<void> {
    if (!this.#listening) return;
    this.#listening = false;
    await new Promise<void>((resolve, reject) => {
      this.#server.close((err) => (err ? reject(err) : resolve()));
      for (const s of [...this.#sessions]) {
        (s as unknown as { destroy?: () => void }).destroy?.();
      }
    });
  }

  #onConnection(socket: Socket): void {
    const idn = this.#resolveIdn();
    const opt = this.#options.optOverride ?? this.#options.personality.opt ?? "";
    const session = new SimulatorSession({
      personality: this.#options.personality,
      idn,
      opt,
      logger: this.#options.logger,
    });
    this.#sessions.add(session);
    const logger = this.#options.logger;
    logger?.(`[${this.#options.personality.id}] connection from ${socket.remoteAddress}:${socket.remotePort}`);

    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      void this.#drain(socket, session, () => {
        const idx = buffer.indexOf(0x0a);
        if (idx === -1) return null;
        const line = buffer.subarray(0, idx);
        buffer = buffer.subarray(idx + 1);
        const trimmed =
          line.length > 0 && line[line.length - 1] === 0x0d
            ? line.subarray(0, line.length - 1)
            : line;
        return trimmed.toString("utf8");
      });
    });

    socket.on("close", () => {
      this.#sessions.delete(session);
    });
    socket.on("error", (err) => {
      logger?.(`[${this.#options.personality.id}] socket error: ${err.message}`);
    });
  }

  async #drain(
    socket: Socket,
    session: SimulatorSession,
    takeLine: () => string | null,
  ): Promise<void> {
    // Serialise per socket — a new data chunk may arrive mid-handler, so we
    // loop until the buffered lines are drained before returning.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = takeLine();
      if (line === null) return;
      const result = await session.handleLine(line);
      if (result.kind === "line") {
        socket.write(Buffer.from(result.text, "utf8"));
        socket.write(this.#terminator);
      } else if (result.kind === "binary") {
        socket.write(Buffer.from(result.bytes));
        socket.write(this.#terminator);
      } else if (result.kind === "error") {
        session.pushError(result.code, result.message);
        if (result.queryPlaceholder !== undefined) {
          socket.write(Buffer.from(result.queryPlaceholder, "utf8"));
          socket.write(this.#terminator);
        }
      }
    }
  }

  #resolveIdn(): string {
    const template = this.#options.idnOverride ?? this.#options.personality.idn;
    const serial = this.#options.serial ?? "SIM000000";
    return template.replace("{serial}", serial);
  }
}
