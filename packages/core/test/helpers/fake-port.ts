import type { ScpiPort } from "../../src/scpi/port.js";

type Reply = string | Uint8Array | ((cmd: string) => string | Uint8Array);

/**
 * In-memory ScpiPort for testing device facades. Drive replies by registering
 * patterns via `onQuery`; `writes` records every fire-and-forget command so
 * tests can assert the exact SCPI sent.
 */
export class FakeScpiPort implements ScpiPort {
  readonly writes: string[] = [];
  readonly binaryWrites: Array<{ command: string; data: Uint8Array }> = [];
  readonly queries: string[] = [];
  readonly #replies: Array<{ readonly pattern: RegExp; readonly reply: Reply }> = [];
  #fallback: Reply = "";

  onQuery(pattern: RegExp | string, reply: Reply): this {
    const re = typeof pattern === "string" ? new RegExp(`^${escapeRegex(pattern)}$`, "i") : pattern;
    this.#replies.push({ pattern: re, reply });
    return this;
  }

  setFallback(reply: Reply): this {
    this.#fallback = reply;
    return this;
  }

  write(command: string): Promise<void> {
    this.writes.push(command);
    return Promise.resolve();
  }

  writeBinary(command: string, data: Uint8Array): Promise<void> {
    this.binaryWrites.push({ command, data });
    return Promise.resolve();
  }

  query(command: string): Promise<string> {
    this.queries.push(command);
    const reply = this.#matchReply(command);
    const value = typeof reply === "function" ? reply(command) : reply;
    return Promise.resolve(typeof value === "string" ? value : new TextDecoder().decode(value));
  }

  queryBinary(command: string): Promise<Uint8Array> {
    this.queries.push(command);
    const reply = this.#matchReply(command);
    const value = typeof reply === "function" ? reply(command) : reply;
    if (value instanceof Uint8Array) return Promise.resolve(value);
    return Promise.resolve(new TextEncoder().encode(value));
  }

  #matchReply(command: string): Reply {
    for (const { pattern, reply } of this.#replies) {
      if (pattern.test(command)) return reply;
    }
    return this.#fallback;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
