import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Shared helpers for Tektronix SCPI. The TBS/MSO/MDO/DPO/AFG/PWS lines all
 * share IEEE 488.2 fundamentals but drift across generations: older
 * firmware (2000-series, TBS1000C) tends to emit shorter forms of headers
 * and accepts looser arguments than the newer 5/6 Series MSO tree. These
 * helpers collect the parsing quirks so the per-family drivers stay
 * readable.
 */
export function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE";
}

export function parseNumberOrZero(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Strip surrounding double quotes. Tektronix firmware quotes most
 * `WFMOutpre:ENCDG?`, `WFMOutpre:BN_FMT?` replies and some `*OPT?`
 * tokens; unwrapping keeps downstream string comparisons case-stable.
 */
export function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function safeQuery(port: ScpiPort, cmd: string): Promise<string> {
  try {
    return await port.query(cmd);
  } catch {
    return "";
  }
}

/**
 * Query `*OPT?` and split it into a clean token list. Tektronix returns
 * a comma-separated option string; older boxes may prefix numeric IDs
 * with `0:` — we keep the whole token and let call-sites match on
 * substrings (e.g. `options.some((t) => /RF/i.test(t))`).
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
    .filter((tok) => tok.length > 0 && tok.toUpperCase() !== "NONE");
}
