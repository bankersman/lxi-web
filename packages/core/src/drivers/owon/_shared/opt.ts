import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Owon firmwares are inconsistent about `*OPT?` support:
 *   - Modern XDM DMMs answer with a comma-separated list.
 *   - SPE PSUs typically reject `*OPT?` with `-113 Undefined header`.
 *   - XDS scopes answer on some firmware revisions and silently time
 *     out on others.
 *
 * The refiner helpers must never throw — a timeout or error falls
 * through to an empty option list so driver construction stays on
 * the base profile.
 */
export async function queryOptList(
  port: ScpiPort,
  timeoutMs = 1000,
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
