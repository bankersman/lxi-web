import { TcpTransport, type TcpTransportOptions } from "./tcp-transport.js";
import type { Transport } from "./transport.js";
import type { ScpiPort, ScpiQueryOptions } from "./port.js";
import {
  ScpiClosedError,
  ScpiError,
  ScpiProtocolError,
  ScpiTimeoutError,
} from "./errors.js";

export interface ScpiSessionOptions {
  /** Default reply timeout for `query` / `queryBinary`. Default 5000 ms. */
  readonly defaultTimeoutMs?: number;
  /** Terminator appended to outgoing commands. Default is LF (`"\n"`). */
  readonly terminator?: string;
}

const LF = 0x0a;

type PendingResolve = (value: string | Uint8Array | void) => void;
type PendingReject = (error: Error) => void;
type ReadMode = "none" | "line" | "binary";

interface Job {
  readonly command: string | null;
  readonly mode: ReadMode;
  readonly timeoutMs: number;
  resolve: PendingResolve;
  reject: PendingReject;
}

/**
 * Vendor-agnostic SCPI session. Serializes commands one at a time and knows
 * how to read both newline-terminated ASCII replies and IEEE 488.2 definite-
 * length binary blocks (`#<n><length><bytes>`).
 */
type CloseListener = (error?: Error) => void;

export class ScpiSession implements ScpiPort {
  readonly #transport: Transport;
  readonly #defaultTimeoutMs: number;
  readonly #terminatorBytes: Uint8Array;
  readonly #queue: Job[] = [];
  #buffer: Uint8Array = new Uint8Array(0);
  #inFlight: Job | null = null;
  #closed = false;
  #disposeTransportListeners: Array<() => void> = [];
  readonly #closeListeners = new Set<CloseListener>();

  constructor(transport: Transport, options: ScpiSessionOptions = {}) {
    this.#transport = transport;
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 5000;
    this.#terminatorBytes = new TextEncoder().encode(options.terminator ?? "\n");
    this.#disposeTransportListeners.push(
      transport.onData((chunk) => this.#handleData(chunk)),
      transport.onClose((err) => this.#handleClose(err)),
    );
  }

  /**
   * Build a session backed by a freshly-connected TCP transport. Convenience
   * wrapper for the common case where caller doesn't need a custom transport.
   */
  static async openTcp(
    options: TcpTransportOptions & ScpiSessionOptions,
  ): Promise<ScpiSession> {
    const transport = new TcpTransport(options);
    await transport.connect();
    return new ScpiSession(transport, options);
  }

  get closed(): boolean {
    return this.#closed;
  }

  /**
   * Listen for **unexpected** transport loss (peer dropped the socket, TCP
   * RST, read timeout). Explicit {@link close} does **not** invoke these
   * listeners — the caller already knows.
   */
  onClose(listener: CloseListener): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  write(command: string): Promise<void> {
    return this.#enqueue<void>({
      command,
      mode: "none",
      timeoutMs: this.#defaultTimeoutMs,
    });
  }

  query(command: string, options: ScpiQueryOptions = {}): Promise<string> {
    return this.#enqueue<string>({
      command,
      mode: "line",
      timeoutMs: options.timeoutMs ?? this.#defaultTimeoutMs,
    });
  }

  queryBinary(
    command: string,
    options: ScpiQueryOptions = {},
  ): Promise<Uint8Array> {
    return this.#enqueue<Uint8Array>({
      command,
      mode: "binary",
      timeoutMs: options.timeoutMs ?? this.#defaultTimeoutMs,
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const err = new ScpiClosedError();
    if (this.#inFlight) {
      this.#inFlight.reject(err);
      this.#inFlight = null;
    }
    while (this.#queue.length > 0) {
      this.#queue.shift()!.reject(err);
    }
    for (const off of this.#disposeTransportListeners) off();
    this.#disposeTransportListeners = [];
    await this.#transport.close();
  }

  #enqueue<T>(spec: Omit<Job, "resolve" | "reject">): Promise<T> {
    if (this.#closed) {
      return Promise.reject(new ScpiClosedError());
    }
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        ...spec,
        resolve: resolve as PendingResolve,
        reject,
      };
      this.#queue.push(job);
      void this.#pump();
    });
  }

  async #pump(): Promise<void> {
    if (this.#inFlight || this.#queue.length === 0 || this.#closed) return;
    const job = this.#queue.shift()!;
    this.#inFlight = job;

    try {
      if (job.command !== null) {
        await this.#sendCommand(job.command);
      }
      if (job.mode === "none") {
        this.#completeInFlight(undefined);
      } else {
        this.#armDeadline(job);
        this.#tryDeliver();
      }
    } catch (err) {
      this.#failInFlight(err);
    }
  }

  #sendCommand(command: string): Promise<void> {
    const body = new TextEncoder().encode(command);
    const framed = new Uint8Array(body.length + this.#terminatorBytes.length);
    framed.set(body, 0);
    framed.set(this.#terminatorBytes, body.length);
    return this.#transport.write(framed);
  }

  #armDeadline(job: Job): void {
    if (job.timeoutMs <= 0) return;
    const timer = setTimeout(() => {
      if (this.#inFlight !== job) return;
      this.#failInFlight(
        new ScpiTimeoutError(
          `no reply within ${job.timeoutMs}ms for ${job.command ?? "(no command)"}`,
        ),
      );
    }, job.timeoutMs);
    // Fire-and-forget cleanup: the timer is cleared when the job ends via
    // `completeInFlight` / `failInFlight` swapping out `#inFlight`.
    (job as unknown as { timer: ReturnType<typeof setTimeout> }).timer = timer;
  }

  #clearDeadline(job: Job): void {
    const withTimer = job as unknown as {
      timer?: ReturnType<typeof setTimeout>;
    };
    if (withTimer.timer) {
      clearTimeout(withTimer.timer);
      withTimer.timer = undefined;
    }
  }

  #handleData(chunk: Uint8Array): void {
    if (this.#closed) return;
    this.#buffer = concat(this.#buffer, chunk);
    this.#tryDeliver();
  }

  #tryDeliver(): void {
    const job = this.#inFlight;
    if (!job) return;

    try {
      if (job.mode === "line") {
        const line = this.#consumeLine();
        if (line !== null) this.#completeInFlight(line);
      } else if (job.mode === "binary") {
        const block = this.#consumeBinaryBlock();
        if (block !== null) this.#completeInFlight(block);
      }
    } catch (err) {
      this.#failInFlight(err);
    }
  }

  #consumeLine(): string | null {
    const idx = this.#buffer.indexOf(LF);
    if (idx === -1) return null;
    const slice = this.#buffer.subarray(0, idx);
    this.#buffer = this.#buffer.subarray(idx + 1);
    const trimmed =
      slice.length > 0 && slice[slice.length - 1] === 0x0d
        ? slice.subarray(0, -1)
        : slice;
    return new TextDecoder().decode(trimmed);
  }

  #consumeBinaryBlock(): Uint8Array | null {
    const buf = this.#buffer;
    if (buf.length < 2) return null;
    if (buf[0] !== 0x23 /* '#' */) {
      throw new ScpiProtocolError(
        `expected IEEE block header '#', got 0x${(buf[0] ?? 0).toString(16)}`,
      );
    }
    const digitCount = buf[1]! - 0x30;
    if (digitCount <= 0 || digitCount > 9) {
      throw new ScpiProtocolError(
        `invalid IEEE block digit-count: ${digitCount}`,
      );
    }
    if (buf.length < 2 + digitCount) return null;
    const lengthBytes = buf.subarray(2, 2 + digitCount);
    const length = Number.parseInt(new TextDecoder().decode(lengthBytes), 10);
    if (!Number.isFinite(length) || length < 0) {
      throw new ScpiProtocolError(`invalid IEEE block length: ${length}`);
    }
    const headerSize = 2 + digitCount;
    if (buf.length < headerSize + length) return null;
    const body = buf.subarray(headerSize, headerSize + length);
    let nextStart = headerSize + length;
    if (buf.length > nextStart && buf[nextStart] === LF) nextStart += 1;
    this.#buffer = buf.subarray(nextStart);
    return new Uint8Array(body);
  }

  #completeInFlight(value: string | Uint8Array | undefined): void {
    const job = this.#inFlight;
    if (!job) return;
    this.#inFlight = null;
    this.#clearDeadline(job);
    job.resolve(value as never);
    void this.#pump();
  }

  #failInFlight(err: unknown): void {
    const job = this.#inFlight;
    if (!job) return;
    this.#inFlight = null;
    this.#clearDeadline(job);
    job.reject(toScpiError(err));
    void this.#pump();
  }

  #handleClose(err?: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    const wrapped = err ?? new ScpiClosedError("transport closed");
    if (this.#inFlight) {
      this.#failInFlight(wrapped);
    }
    while (this.#queue.length > 0) {
      this.#queue.shift()!.reject(toScpiError(wrapped));
    }
    for (const listener of this.#closeListeners) {
      try {
        listener(err);
      } catch {
        // Swallow listener errors — close notifications must not cascade.
      }
    }
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toScpiError(err: unknown): Error {
  if (err instanceof ScpiError) return err;
  if (err instanceof Error) return new ScpiError(err.message, { cause: err });
  return new ScpiError(String(err));
}
