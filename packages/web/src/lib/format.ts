const SI_PREFIXES: readonly { readonly exp: number; readonly symbol: string }[] = [
  { exp: 9, symbol: "G" },
  { exp: 6, symbol: "M" },
  { exp: 3, symbol: "k" },
  { exp: 0, symbol: "" },
  { exp: -3, symbol: "m" },
  { exp: -6, symbol: "µ" },
  { exp: -9, symbol: "n" },
  { exp: -12, symbol: "p" },
];

/**
 * Formats a numeric `value` with the SI prefix that keeps the magnitude in
 * [1, 1000). Returns e.g. `1.23 kV`, `450 mA`, `0 V`.
 */
export function formatSi(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return `— ${unit}`;
  if (value === 0) return `0 ${unit}`;
  const abs = Math.abs(value);
  const log = Math.log10(abs);
  const prefix =
    SI_PREFIXES.find((p) => log >= p.exp) ?? SI_PREFIXES[SI_PREFIXES.length - 1];
  const scaled = value / 10 ** prefix.exp;
  return `${formatNumber(scaled, digits)} ${prefix.symbol}${unit}`;
}

function formatNumber(value: number, digits: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(Math.max(0, digits - 3));
  if (Math.abs(value) >= 10) return value.toFixed(Math.max(0, digits - 2));
  return value.toFixed(Math.max(0, digits - 1));
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatTime(epochMs: number): string {
  return TIME_FORMAT.format(new Date(epochMs));
}
