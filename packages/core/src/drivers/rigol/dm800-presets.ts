/**
 * DM858 §3.16 MMEMory: fixed paths on internal flash for preset slots (no *SAV/*RCL).
 */

/** Root folder for lxi-web preset `.sta` files (INT:\ per reference). */
export const DM800_PRESET_FOLDER = String.raw`INT:\LxiPresets`;

const STATE_FILE = /^state(\d+)\.sta$/i;

/** Path passed to MMEMory:STORe:STATe (extension optional per §3.16.11). */
export function dm800PresetStorePath(slot: number): string {
  return `${DM800_PRESET_FOLDER}\\state${slot}`;
}

/** Path passed to MMEMory:LOAD:STATe (explicit .sta per §3.16.6). */
export function dm800PresetLoadPath(slot: number): string {
  return `${DM800_PRESET_FOLDER}\\state${slot}.sta`;
}

/**
 * Parse `MMEMory:CATalog:ALL?` response: `space_used,space_available,"filename,property,size",...`
 * (§3.16.1). On parse errors or unexpected shape, callers should treat as empty catalog.
 */
export function parseDm800PresetCatalog(
  response: string,
  slotCount: number,
): boolean[] {
  const out = Array.from({ length: slotCount }, () => false);
  const trimmed = response.trim();
  if (!trimmed) return out;

  const re = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    const inner = m[1]!;
    const parts = inner.split(",");
    if (parts.length < 3) continue;
    const fileName = parts[0]!.trim();
    const property = parts[1]!.trim();
    if (property !== "STAT") continue;
    const sm = STATE_FILE.exec(fileName);
    if (!sm) continue;
    const idx = Number.parseInt(sm[1]!, 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < slotCount) {
      out[idx] = true;
    }
  }
  return out;
}
