import type { ScpiPort } from "../../../scpi/port.js";

/**
 * Shared helpers for Rohde & Schwarz SCPI. R&S publishes arguably the
 * cleanest IVI-4 dialect on the market — but their catalogue mixes the
 * "RTB/RTM/RTA/MXO" scope tree, the "NGE/NGL/NGM/NGP/NGU" PSU tree, the
 * "HMC/HMP" DMM tree, the "SMA/SMB/SMBV" signal-generator tree, and the
 * "FPC/FPL/HMS" spectrum-analyzer tree. Because several of those SKUs
 * still identify themselves as `HAMEG` (R&S bought Hameg in 2005 and
 * firmware on HMO, HMC, HMS, HMP, HMF still reports `HAMEG`) the
 * family-level drivers load these helpers to stay readable.
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
 * Strip surrounding double quotes. R&S firmware quotes most
 * `CHANnel<n>:LABel?`, `SENSe:FUNCtion?`, and some `*OPT?` tokens; the
 * NGx PSU tree quotes memory-preset titles on `MEMory:STATe:CATalog?`.
 */
export function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
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
 * Query `*OPT?` and split it into a clean token list. R&S returns a
 * comma-separated option list that favours uppercase identifiers with
 * hyphens (e.g. `K54`, `B4`, `K1`, `HV-EXT`). We strip the empty /
 * `NONE` / `0` placeholders that some firmware drops in and return a
 * plain readonly array.
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
    .filter(
      (tok) =>
        tok.length > 0 && tok !== "0" && tok.toUpperCase() !== "NONE",
    );
}

/**
 * Manufacturer regex matching `Rohde & Schwarz`, `ROHDE&SCHWARZ`,
 * `Rohde&Schwarz`, `R&S`, and the legacy `HAMEG` IDN strings that are
 * still alive on HMO / HMS / HMC / HMF / HMP firmware.
 */
export const RNDS_MANUFACTURER = /rohde\s*&\s*schwarz|r&s|hameg/i;
