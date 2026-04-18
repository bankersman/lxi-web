/** One drained row from the instrument error queue (usually `SYST:ERR?`). */
export interface DeviceErrorEntry {
  readonly code: number;
  readonly message: string;
  /** ISO 8601 wall clock when this row was drained server-side. */
  readonly timestamp: string;
  readonly rawLine: string;
}

/** Where a transcript line originated (Epic 5.1 + forward-compatible tags). */
export type TranscriptOrigin =
  | { readonly kind: "driver"; readonly method: string }
  | { readonly kind: "poller"; readonly topic: string }
  | { readonly kind: "errorQueue" }
  | { readonly kind: "rawScpi" }
  | { readonly kind: "action"; readonly actionId: string }
  | { readonly kind: "panic" };

export type TranscriptDirection =
  | "write"
  | "query"
  | "block-write"
  | "block-query";

/** One SCPI exchange captured for a session (ring buffer on the server). */
export interface TranscriptEntry {
  readonly seq: number;
  readonly timestamp: string;
  readonly direction: TranscriptDirection;
  /** SCPI text, or `<binary N bytes>` placeholder for binary bodies. */
  readonly command: string;
  readonly response?: string;
  readonly elapsedMs: number;
  readonly origin: TranscriptOrigin;
}

/** Payload from {@link ScpiSession} before the server assigns `seq` + `timestamp`. */
export type TranscriptRecordInput = Omit<TranscriptEntry, "seq" | "timestamp">;
