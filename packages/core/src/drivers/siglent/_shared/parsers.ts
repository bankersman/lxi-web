/**
 * Siglent firmwares follow IEEE 488.2 closely, but there are consistent
 * quirks across the whole product line:
 *   - `:OUTP?` returns `0`/`1` on current firmware and `OFF`/`ON` on some
 *     older SDM and SPD firmwares.
 *   - `:STATus?` on SPD returns a 4-bit int where bit 4 / bit 5 are CH
 *     protection trips; consumers do the bitmask, this module just gives
 *     them a clean integer.
 *
 * Sharing these helpers across `sds/`, `spd/`, `sdm/`, `sdl/`, `sdg/`
 * prevents family drivers from drifting apart on the same SCPI text.
 */
export function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE" || v === "YES";
}

export function parseNumberOrZero(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Siglent SPD `SYSTem:STATus?` returns a decimal representing a bit field. */
export function parseStatusInt(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    const n = Number.parseInt(trimmed.slice(2), 16);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : 0;
}
