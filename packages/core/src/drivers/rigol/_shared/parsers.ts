/**
 * Rigol SCPI responses are inconsistent across firmware revisions: some nodes
 * return `1`/`0`, others `ON`/`OFF`, and a few (`:QUES?` on DP900 protection
 * trip) reply with `YES`/`NO`. Centralising the parser keeps every driver in
 * the family reading them the same way.
 */
export function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE" || v === "YES";
}

/** Safe numeric parse: returns 0 for NaN / empty / non-finite strings. */
export function parseNumberOrZero(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}
