import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Siglent replies to `*OPT?` with a comma-separated list of option
 * mnemonics (e.g. `SDS-1KX-16LA,SDS-1KX-CANFD,0`). Empty slots come back
 * as `0`; we drop them so callers can use `options.includes(token)`.
 *
 * Some firmwares ignore `*OPT?` entirely and return nothing — we swallow
 * the timeout so the connect path stays fast even for partially-
 * conforming boxes.
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

export function parseOptList(raw: string): readonly string[] {
  return raw
    .trim()
    .split(",")
    .map((tok) => tok.trim())
    .filter((tok) => tok.length > 0 && tok !== "0");
}
