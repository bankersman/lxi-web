/**
 * Shared parse helpers for Owon firmwares.
 *
 * Owon's SCPI is mostly SCPI-1999 compliant but trails Rigol / Keysight /
 * Siglent in conformance tightness. The quirks we normalise here:
 *
 *   - Boolean replies are sometimes `1` / `0`, sometimes `ON` / `OFF`,
 *     sometimes lowercase — depends on the firmware series. `parseBool`
 *     accepts the union.
 *   - Function replies occasionally come back as `"VOLT"` with the
 *     quotes preserved (Keysight-style) and occasionally as `VOLT`
 *     bare. `unquote` strips matching leading/trailing quote pairs.
 *   - Owon overload reports are typically `9.9E+37` (IEEE overload
 *     sentinel) but some XDM firmwares emit a literal `OL` string.
 */
export function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE" || v === "YES";
}

export function parseNumberOrZero(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed.charAt(0);
    const last = trimmed.charAt(trimmed.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Parse an Owon DMM reading, returning the numeric value plus an
 * overload flag. Covers both the IEEE 9.9e37 sentinel and the string
 * `OL` emitted by certain XDM firmwares.
 */
export function parseReading(raw: string): { value: number; overload: boolean } {
  const trimmed = unquote(raw);
  if (/^OL$/i.test(trimmed)) {
    return { value: Number.POSITIVE_INFINITY, overload: true };
  }
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return { value: 0, overload: false };
  const overload = Math.abs(n) > 1e36;
  return { value: overload ? Number.POSITIVE_INFINITY : n, overload };
}
