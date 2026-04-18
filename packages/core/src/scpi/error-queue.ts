import type { DeviceErrorEntry } from "../dto/transcript.js";
import type { ScpiPort } from "./port.js";

/** Drains the instrument error queue (usually via `SYST:ERR?`). */
export interface IErrorQueue {
  readonly pollIntervalMs: number;
  drain(): Promise<DeviceErrorEntry[]>;
}

/**
 * Parse `SYST:ERR?` style lines: `-113,"Undefined header"` or `0,"No error"`.
 * Returns `null` when the queue is empty (sentinel).
 */
export function parseSystErrLine(line: string): {
  code: number;
  message: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = /^(-?\d+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*$/s.exec(trimmed);
  if (!m) {
    return { code: 0, message: trimmed };
  }
  const code = Number(m[1]);
  const message = m[2]?.replace(/\\"/g, '"') ?? "";
  if (code === 0 && /no error/i.test(message)) return null;
  return { code, message };
}

/**
 * Drain every pending error until `0,"No error"` (or empty/parse failure).
 */
export async function drainSystErr(
  port: ScpiPort,
  opts?: { readonly maxIterations?: number; readonly queryTimeoutMs?: number },
): Promise<DeviceErrorEntry[]> {
  const maxIterations = opts?.maxIterations ?? 256;
  const queryTimeoutMs = opts?.queryTimeoutMs ?? 1500;
  const out: DeviceErrorEntry[] = [];
  for (let i = 0; i < maxIterations; i++) {
    const ts = new Date().toISOString();
    let line: string;
    try {
      line = await port.query("SYST:ERR?", { timeoutMs: queryTimeoutMs });
    } catch {
      break;
    }
    const parsed = parseSystErrLine(line);
    if (parsed === null) break;
    out.push({
      code: parsed.code,
      message: parsed.message,
      timestamp: ts,
      rawLine: line.trim(),
    });
  }
  return out;
}

export function createSystErrErrorQueue(
  port: ScpiPort,
  pollIntervalMs = 2000,
): IErrorQueue {
  return {
    pollIntervalMs,
    drain: () => drainSystErr(port),
  };
}
