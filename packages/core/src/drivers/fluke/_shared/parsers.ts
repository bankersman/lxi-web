import type { ScpiPort } from "../../../scpi/port.js";

/** Shared manufacturer regex — matches `Fluke` / `FLUKE` / `fluke`. */
export const FLUKE_MANUFACTURER = /fluke/i;

/**
 * Some older Fluke firmware (especially 8508A + metrology-grade units)
 * accept `*ID?` as a legacy alias for `*IDN?`. The session always sends
 * `*IDN?` first; this helper is for call-sites that want to tolerate
 * either spelling when inspecting raw output.
 */
export function normaliseIdnQuery(cmd: string): string {
  const upper = cmd.toUpperCase().trim();
  if (upper === "*ID?" || upper === ":*ID?") return "*IDN?";
  return cmd;
}

/**
 * Parse an "ON" / "OFF" / "1" / "0" SCPI boolean. Returns false for
 * unparseable input so drivers never throw on a stale reply.
 */
export function parseBool(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return false;
  if (trimmed === "1" || trimmed === "ON" || trimmed === "TRUE") return true;
  if (trimmed === "0" || trimmed === "OFF" || trimmed === "FALSE") return false;
  return Number.parseFloat(trimmed) !== 0;
}

/**
 * Parse a numeric SCPI reply, returning 0 on any failure. Fluke firmware
 * occasionally pads responses with spaces and trailing units (e.g.
 * `"+1.23456E+00 V"`); strip the non-numeric tail before parsing.
 */
export function parseNumberOrZero(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(trimmed);
  if (!match) return 0;
  const n = Number.parseFloat(match[0]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Strip single- or double-quote wrappers from an SCPI string reply.
 * Fluke `SENSe:FUNCtion?` returns `"VOLT"` / `'VOLT'` depending on
 * firmware revision; normalise to the bare token.
 */
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

/**
 * Issue a query and swallow transport / firmware errors. Fluke bench
 * DMMs sometimes `-113 Undefined header` on capability queries; drivers
 * prefer a silent empty response to a thrown error.
 */
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
 * Query `SYSTem:OPTion?` (preferred) and fall back to `*OPT?` for older
 * Fluke bench firmware. Returns the tokenised list, uppercased and
 * trimmed, with placeholder tokens (`0`, `NONE`) dropped.
 */
export async function queryOptList(
  port: ScpiPort,
  timeoutMs = 1500,
): Promise<readonly string[]> {
  for (const cmd of ["SYSTem:OPTion?", "*OPT?"]) {
    const raw = await safeQuery(port, cmd, timeoutMs);
    const parsed = parseOptList(raw);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

export function parseOptList(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((tok) => tok.trim().replace(/^"+|"+$/g, ""))
    .filter((tok) => tok.length > 0 && tok !== "0" && tok.toUpperCase() !== "NONE");
}
