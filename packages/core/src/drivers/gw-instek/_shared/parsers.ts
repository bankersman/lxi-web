import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Manufacturer regex — matches `GW Instek`, `GWINSTEK`, `GW-INSTEK`,
 * and whitespace/hyphen variants. Some older firmware reports just
 * `INSTEK` or `GoodWill Instrument`, so tolerate both.
 */
export const GWINSTEK_MANUFACTURER =
  /gw\s*-?\s*instek|gwinstek|goodwill\s*instrument/i;

export function parseBool(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return false;
  if (trimmed === "1" || trimmed === "ON" || trimmed === "TRUE") return true;
  if (trimmed === "0" || trimmed === "OFF" || trimmed === "FALSE") return false;
  return Number.parseFloat(trimmed) !== 0;
}

export function parseNumberOrZero(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(trimmed);
  if (!match) return 0;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : 0;
}

export function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export async function safeQuery(
  port: ScpiPort,
  cmd: string,
  timeoutMs = 2500,
): Promise<string> {
  try {
    return await port.query(cmd, { timeoutMs });
  } catch {
    return "";
  }
}

/**
 * GW Instek firmware is inconsistent about `*OPT?` — some families
 * reply `"0"` / `"NONE"` / empty. Return a clean, de-duplicated list.
 */
export async function queryOptList(
  port: ScpiPort,
  timeoutMs = 1500,
): Promise<readonly string[]> {
  const raw = await safeQuery(port, "*OPT?", timeoutMs);
  return parseOptList(raw);
}

export function parseOptList(raw: string): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(",")) {
    const trimmed = tok.trim().replace(/^"+|"+$/g, "");
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (upper === "0" || upper === "NONE") continue;
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(trimmed);
  }
  return out;
}
