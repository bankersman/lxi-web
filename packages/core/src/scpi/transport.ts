/**
 * Minimal byte-stream transport contract used by `ScpiSession`.
 *
 * Splitting transport from session lets us back the session with a real TCP
 * socket in production and with a synthetic in-memory pipe in tests.
 */
export interface Transport {
  readonly connected: boolean;
  connect(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  onData(listener: (chunk: Uint8Array) => void): () => void;
  onClose(listener: (error?: Error) => void): () => void;
}
