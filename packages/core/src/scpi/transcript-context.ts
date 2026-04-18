import { AsyncLocalStorage } from "node:async_hooks";
import type { TranscriptOrigin } from "../dto/transcript.js";

const als = new AsyncLocalStorage<TranscriptOrigin>();

const defaultOrigin: TranscriptOrigin = {
  kind: "driver",
  method: "port",
};

export function getTranscriptOrigin(): TranscriptOrigin {
  return als.getStore() ?? defaultOrigin;
}

export function runWithTranscriptOrigin<T>(
  origin: TranscriptOrigin,
  fn: () => T,
): T {
  return als.run(origin, fn);
}

export function runAsyncWithTranscriptOrigin<T>(
  origin: TranscriptOrigin,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(origin, fn);
}
