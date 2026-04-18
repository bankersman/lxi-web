import type { TranscriptRecordInput } from "../dto/transcript.js";

/** Session-scoped sink; must never await — pushes into a bounded buffer. */
export interface TranscriptSink {
  record(entry: TranscriptRecordInput): void;
}
