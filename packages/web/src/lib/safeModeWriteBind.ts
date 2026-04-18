/** Tooltip for controls blocked by safe mode (Epic 5.3). */
export const SAFE_MODE_WRITE_TITLE = "Safe mode — unlock in the header";

const STORAGE_KEY = "lxi-web.safeMode.v1";

export interface SafeModePersistedV1 {
  readonly enabled: boolean;
}

export function readSafeModeFromStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw) as Partial<SafeModePersistedV1>;
    return v.enabled === true;
  } catch {
    return false;
  }
}

export function writeSafeModeToStorage(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled } satisfies SafeModePersistedV1));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Merge instrument-local disabled state with global safe-mode lock.
 * When `safeModeOn`, `title` explains why writes are blocked.
 */
export function mergeWriteGate(ownDisabled: boolean, safeModeOn: boolean) {
  const d = ownDisabled || safeModeOn;
  return {
    disabled: d,
    "aria-disabled": d,
    title: safeModeOn ? SAFE_MODE_WRITE_TITLE : "",
  };
}
