import type {
  DeviceErrorEntry,
  TranscriptEntry,
  TranscriptRecordInput,
} from "@lxi-web/core";

/** FIFO ring for device error rows (newest wins on overflow). */
export class DeviceErrorRing {
  readonly #max: number;
  #buf: DeviceErrorEntry[] = [];

  constructor(maxSize: number) {
    this.#max = Math.max(1, maxSize);
  }

  pushMany(entries: readonly DeviceErrorEntry[]): void {
    for (const e of entries) {
      this.#buf.push(e);
      while (this.#buf.length > this.#max) this.#buf.shift();
    }
  }

  snapshot(): DeviceErrorEntry[] {
    return [...this.#buf];
  }

  clear(): void {
    this.#buf = [];
  }
}

/** Monotonic-seq ring for SCPI transcript lines. */
export class TranscriptRing {
  readonly #max: number;
  #seq = 1;
  #buf: TranscriptEntry[] = [];

  constructor(maxSize: number) {
    this.#max = Math.max(1, maxSize);
  }

  push(input: TranscriptRecordInput): TranscriptEntry {
    const entry: TranscriptEntry = {
      ...input,
      seq: this.#seq++,
      timestamp: new Date().toISOString(),
    };
    this.#buf.push(entry);
    while (this.#buf.length > this.#max) this.#buf.shift();
    return entry;
  }

  getSince(sinceSeq: number, limit: number): TranscriptEntry[] {
    const out: TranscriptEntry[] = [];
    for (const e of this.#buf) {
      if (e.seq <= sinceSeq) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Newest entries first (for tail replay). */
  tail(limit: number): TranscriptEntry[] {
    if (this.#buf.length <= limit) return [...this.#buf];
    return this.#buf.slice(-limit);
  }

  allInOrder(): TranscriptEntry[] {
    return [...this.#buf];
  }

  get maxSeq(): number {
    return this.#seq - 1;
  }
}
