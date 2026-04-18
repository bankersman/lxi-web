import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Query Keysight `*OPT?` and split it into a clean token list. Keysight
 * returns comma-separated tokens, with `0` signalling an empty slot on
 * some older Agilent firmwares. We drop empties so `options.includes(x)`
 * is the only call-site shape.
 *
 * Swallow errors: some fleet boxes intentionally firewall `*OPT?` over
 * LAN, and the connect path must stay fast even if this returns empty.
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
