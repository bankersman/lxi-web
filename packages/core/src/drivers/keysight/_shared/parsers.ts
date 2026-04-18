/**
 * Keysight (and pre-2014 Agilent) firmwares follow SCPI-1999 / IEEE 488.2
 * precisely. A handful of conventions worth collecting so the five
 * family drivers (`infiniivision/`, `e36/`, `truevolt/`, `el3/`, `3350x/`)
 * don't drift on the same text:
 *
 *   - Boolean queries reply with `0` / `1` (never the word form).
 *   - `FUNCtion?` reads are quoted strings on Truevolt / 33500B; the
 *     quotes need stripping before the token starts with `"VOLT"` or
 *     similar. InfiniiVision reads are unquoted.
 *   - Measurement replies use the SCPI overload sentinel `9.91E+37`
 *     (we also guard for `9.9e37`).
 *   - `*OPT?` comes back as a comma-separated list of license / option
 *     codes, often with `0` placeholders for empty slots.
 */
export function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE" || v === "YES";
}

export function parseNumberOrZero(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Strip surrounding double quotes. Truevolt / 33500B firmwares wrap
 * every `FUNCtion?` reply in `"..."`; the outer quotes are ASCII 0x22
 * so plain character matching suffices.
 */
export function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * SCPI overload / out-of-range sentinel: 9.91E+37 (also 9.9E+37 on some
 * older firmwares). Preserves the sign so we can render -inf as well.
 */
export function isOverload(n: number): boolean {
  return Math.abs(n) > 1e36;
}
