import type { Transport } from "../../src/scpi/transport.js";

/**
 * In-memory transport for SCPI tests. The test drives data into the session
 * via `emit` and observes bytes the session wrote via `written`.
 */
export class FakeTransport implements Transport {
  connected = true;
  readonly written: Uint8Array[] = [];
  #dataListeners = new Set<(chunk: Uint8Array) => void>();
  #closeListeners = new Set<(err?: Error) => void>();

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  write(data: Uint8Array): Promise<void> {
    this.written.push(new Uint8Array(data));
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.connected = false;
    for (const l of this.#closeListeners) l();
    return Promise.resolve();
  }

  onData(cb: (chunk: Uint8Array) => void): () => void {
    this.#dataListeners.add(cb);
    return () => this.#dataListeners.delete(cb);
  }

  onClose(cb: (err?: Error) => void): () => void {
    this.#closeListeners.add(cb);
    return () => this.#closeListeners.delete(cb);
  }

  emit(data: string | Uint8Array): void {
    const chunk =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    for (const l of this.#dataListeners) l(chunk);
  }

  emitClose(err?: Error): void {
    this.connected = false;
    for (const l of this.#closeListeners) l(err);
  }

  writtenText(): string {
    let total = 0;
    for (const c of this.written) total += c.length;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of this.written) {
      merged.set(c, offset);
      offset += c.length;
    }
    return new TextDecoder().decode(merged);
  }
}
