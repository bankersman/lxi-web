import { Socket } from "node:net";
import type { Transport } from "./transport.js";
import { ScpiTimeoutError, ScpiTransportError } from "./errors.js";

export interface TcpTransportOptions {
  readonly host: string;
  readonly port: number;
  /** Timeout waiting for the TCP connection to establish. Default 5000 ms. */
  readonly connectTimeoutMs?: number;
}

type DataListener = (chunk: Uint8Array) => void;
type CloseListener = (error?: Error) => void;

/**
 * Node `net.Socket`-backed transport. Handles only raw bytes — line framing
 * and IEEE block parsing live in `ScpiSession`.
 */
export class TcpTransport implements Transport {
  readonly #host: string;
  readonly #port: number;
  readonly #connectTimeoutMs: number;
  #socket: Socket | null = null;
  #connected = false;
  #closed = false;
  readonly #dataListeners = new Set<DataListener>();
  readonly #closeListeners = new Set<CloseListener>();

  constructor(options: TcpTransportOptions) {
    this.#host = options.host;
    this.#port = options.port;
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 5000;
  }

  get connected(): boolean {
    return this.#connected && !this.#closed;
  }

  connect(): Promise<void> {
    if (this.#closed) {
      return Promise.reject(new ScpiTransportError("transport already closed"));
    }
    if (this.#connected) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      this.#socket = socket;

      const onError = (err: Error): void => {
        cleanup();
        this.#handleFailure(err, reject);
      };
      const onTimeout = (): void => {
        const err = new ScpiTimeoutError(
          `connect to ${this.#host}:${this.#port} timed out after ${this.#connectTimeoutMs}ms`,
        );
        cleanup();
        socket.destroy(err);
        this.#handleFailure(err, reject);
      };
      const onConnect = (): void => {
        cleanup();
        socket.setTimeout(0);
        this.#connected = true;
        socket.on("data", (chunk) => {
          for (const listener of this.#dataListeners) listener(chunk);
        });
        socket.on("error", (err) => {
          this.#handleFailure(err);
        });
        socket.on("close", () => {
          this.#connected = false;
          if (!this.#closed) {
            this.#handleFailure(
              new ScpiTransportError("socket closed by peer"),
            );
          }
        });
        resolve();
      };

      const cleanup = (): void => {
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
        socket.off("connect", onConnect);
      };

      socket.setTimeout(this.#connectTimeoutMs);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
      socket.once("connect", onConnect);
      socket.connect(this.#port, this.#host);
    });
  }

  write(data: Uint8Array): Promise<void> {
    if (!this.#connected || !this.#socket) {
      return Promise.reject(new ScpiTransportError("transport not connected"));
    }
    return new Promise<void>((resolve, reject) => {
      this.#socket!.write(data, (err) => {
        if (err) reject(new ScpiTransportError(err.message, { cause: err }));
        else resolve();
      });
    });
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.#connected = false;
    const socket = this.#socket;
    this.#socket = null;
    return new Promise<void>((resolve) => {
      if (!socket || socket.destroyed) {
        this.#notifyClose();
        resolve();
        return;
      }
      socket.end(() => {
        socket.destroy();
        this.#notifyClose();
        resolve();
      });
    });
  }

  onData(listener: DataListener): () => void {
    this.#dataListeners.add(listener);
    return () => this.#dataListeners.delete(listener);
  }

  onClose(listener: CloseListener): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  #handleFailure(err: Error, reject?: (err: Error) => void): void {
    const wrapped =
      err instanceof ScpiTimeoutError || err instanceof ScpiTransportError
        ? err
        : new ScpiTransportError(err.message, { cause: err });
    if (reject) reject(wrapped);
    this.#closed = true;
    this.#connected = false;
    for (const listener of this.#closeListeners) listener(wrapped);
  }

  #notifyClose(): void {
    for (const listener of this.#closeListeners) listener();
  }
}
