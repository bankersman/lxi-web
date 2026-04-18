/**
 * Base class for all SCPI session errors. Every error emitted by the SCPI
 * layer is an instance of `ScpiError`, so callers can narrow on it once and
 * still branch on the specific subclass when they care about the cause.
 */
export class ScpiError extends Error {
  override readonly name: string = "ScpiError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ScpiTimeoutError extends ScpiError {
  override readonly name = "ScpiTimeoutError";
  constructor(message: string) {
    super(message);
  }
}

export class ScpiTransportError extends ScpiError {
  override readonly name = "ScpiTransportError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ScpiProtocolError extends ScpiError {
  override readonly name = "ScpiProtocolError";
  constructor(message: string) {
    super(message);
  }
}

export class ScpiClosedError extends ScpiError {
  override readonly name = "ScpiClosedError";
  constructor(message = "SCPI session is closed") {
    super(message);
  }
}
