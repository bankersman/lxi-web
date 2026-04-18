import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

const STORAGE_KEY = "lxi-web.savedConnections.v1";
const SCHEMA_VERSION = 1;

/**
 * Persisted address-book entry. The `id` is generated client-side and is
 * unrelated to the server's `sessionId`; after 3.2 the server mints a fresh
 * sessionId on every reconnect, so the browser has to own the stable
 * identity of a "this is my bench scope" row.
 */
export interface SavedConnection {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly label: string;
  readonly autoConnect: boolean;
  readonly lastConnectedAt: number | null;
}

interface PersistedShape {
  readonly version: number;
  readonly entries: readonly SavedConnection[];
}

function load(): SavedConnection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (!parsed || parsed.version !== SCHEMA_VERSION) return [];
    return (parsed.entries ?? []).filter(isValid).map(normalize);
  } catch {
    return [];
  }
}

function persist(entries: readonly SavedConnection[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedShape = { version: SCHEMA_VERSION, entries };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing / quota — silently drop rather than break the UI.
  }
}

function isValid(entry: unknown): entry is SavedConnection {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.host === "string" &&
    typeof e.port === "number" &&
    Number.isInteger(e.port) &&
    e.port > 0 &&
    e.port <= 65535
  );
}

function normalize(entry: SavedConnection): SavedConnection {
  return {
    id: entry.id,
    host: entry.host,
    port: entry.port,
    label: typeof entry.label === "string" && entry.label ? entry.label : entry.host,
    autoConnect: Boolean(entry.autoConnect),
    lastConnectedAt:
      typeof entry.lastConnectedAt === "number" ? entry.lastConnectedAt : null,
  };
}

function addressKey(host: string, port: number): string {
  return `${host.toLowerCase()}:${port}`;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sc_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/**
 * Browser-local address book for bench instruments. Persistence lives
 * exclusively in `localStorage`: the server never sees this list, which keeps
 * the Docker image (3.6) stateless and the "no config on production deploy"
 * deployment story intact.
 */
export const useSavedConnectionsStore = defineStore("savedConnections", () => {
  const entries = ref<SavedConnection[]>(load());

  watch(
    entries,
    (next) => {
      persist(next);
    },
    { deep: true },
  );

  const list = computed<readonly SavedConnection[]>(() =>
    [...entries.value].sort((a, b) => a.label.localeCompare(b.label)),
  );

  const count = computed(() => entries.value.length);

  function findByAddress(host: string, port: number): SavedConnection | undefined {
    const key = addressKey(host, port);
    return entries.value.find((e) => addressKey(e.host, e.port) === key);
  }

  function add(input: {
    host: string;
    port: number;
    label?: string;
    autoConnect?: boolean;
  }): SavedConnection {
    const host = input.host.trim();
    const port = input.port;
    const existing = findByAddress(host, port);
    if (existing) return existing;
    const entry: SavedConnection = {
      id: generateId(),
      host,
      port,
      label: input.label?.trim() || host,
      autoConnect: Boolean(input.autoConnect),
      lastConnectedAt: null,
    };
    entries.value = [...entries.value, entry];
    return entry;
  }

  function remove(id: string): void {
    entries.value = entries.value.filter((e) => e.id !== id);
  }

  function update(id: string, patch: Partial<Omit<SavedConnection, "id">>): void {
    entries.value = entries.value.map((e) => {
      if (e.id !== id) return e;
      return normalize({ ...e, ...patch });
    });
  }

  function setAutoConnect(id: string, value: boolean): void {
    update(id, { autoConnect: value });
  }

  function markConnected(host: string, port: number, at: number = Date.now()): void {
    const existing = findByAddress(host, port);
    if (existing) {
      update(existing.id, { lastConnectedAt: at });
      return;
    }
    entries.value = [
      ...entries.value,
      {
        id: generateId(),
        host,
        port,
        label: host,
        autoConnect: false,
        lastConnectedAt: at,
      },
    ];
  }

  return {
    list,
    count,
    findByAddress,
    add,
    remove,
    update,
    setAutoConnect,
    markConnected,
  };
});
