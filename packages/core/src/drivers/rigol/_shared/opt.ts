import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Probe `*OPT?` with a short timeout so a firmware that silently drops it
 * doesn't stall the connect path. (DM800-family DMMs do not use this helper —
 * their firmware does not implement `*OPT?` safely.)
 */
export async function queryOptList(
  port: ScpiPort,
  timeoutMs = 1500,
): Promise<readonly string[]> {
  try {
    const raw = await port.query("*OPT?", { timeoutMs });
    return parseOptList(raw);
  } catch {
    return [];
  }
}

/**
 * `*OPT?` returns a comma-separated list of installed option mnemonics. Empty
 * slots are reported as `0`; we drop them so callers can test membership with
 * `options.includes(token)` without false positives.
 */
export function parseOptList(raw: string): readonly string[] {
  return raw
    .trim()
    .split(",")
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 0 && tok !== "0");
}
