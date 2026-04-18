export interface ScpiQueryOptions {
  /** Per-call override for how long to wait for a reply, in milliseconds. */
  readonly timeoutMs?: number;
}

/**
 * The narrow contract every SCPI consumer depends on. Facades take an
 * `ScpiPort` so they can be exercised with a fake in unit tests and with a
 * real `ScpiSession` in production without knowing about transports.
 */
export interface ScpiPort {
  write(command: string): Promise<void>;
  /**
   * Send a command with an IEEE 488.2 definite-length arbitrary block
   * appended. The transport takes care of the `#<d><length><bytes>` framing;
   * callers only pass the header command (e.g. `DATA:DAC VOLATILE,`) and the
   * raw payload bytes.
   */
  writeBinary(command: string, data: Uint8Array): Promise<void>;
  query(command: string, options?: ScpiQueryOptions): Promise<string>;
  queryBinary(command: string, options?: ScpiQueryOptions): Promise<Uint8Array>;
}
