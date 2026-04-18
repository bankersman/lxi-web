import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ServerMessage, SessionSummary } from "@lxi-web/core/browser";
import { api } from "@/api/client";

/**
 * Live source of truth for all connected (and connecting / errored) instrument
 * sessions. Populated from a single WebSocket that emits `sessions:init` on
 * connect and `sessions:update` / `sessions:removed` on every lifecycle
 * change.
 */
export const useSessionsStore = defineStore("sessions", () => {
  const byId = ref<Map<string, SessionSummary>>(new Map());
  const wsConnected = ref(false);
  const wsError = ref<string | null>(null);
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const list = computed<readonly SessionSummary[]>(() =>
    Array.from(byId.value.values()).sort((a, b) => a.openedAt - b.openedAt),
  );
  const count = computed(() => byId.value.size);

  function get(id: string): SessionSummary | undefined {
    return byId.value.get(id);
  }

  function apply(message: ServerMessage): void {
    if (message.type === "sessions:init") {
      const next = new Map<string, SessionSummary>();
      for (const s of message.sessions) next.set(s.id, s);
      byId.value = next;
    } else if (message.type === "sessions:update") {
      const next = new Map(byId.value);
      next.set(message.session.id, message.session);
      byId.value = next;
    } else if (message.type === "sessions:removed") {
      const next = new Map(byId.value);
      next.delete(message.id);
      byId.value = next;
    }
  }

  function connect(): void {
    if (socket) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener("open", () => {
      wsConnected.value = true;
      wsError.value = null;
    });
    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        apply(message);
      } catch (err) {
        console.warn("malformed ws message", err);
      }
    });
    ws.addEventListener("close", () => {
      wsConnected.value = false;
      socket = null;
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      wsError.value = "WebSocket error";
    });
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1500);
  }

  async function refresh(): Promise<void> {
    const sessions = await api.listSessions();
    const next = new Map<string, SessionSummary>();
    for (const s of sessions) next.set(s.id, s);
    byId.value = next;
  }

  async function open(host: string, port?: number): Promise<SessionSummary> {
    const summary = await api.openSession(host, port);
    const next = new Map(byId.value);
    next.set(summary.id, summary);
    byId.value = next;
    return summary;
  }

  async function remove(id: string): Promise<void> {
    await api.closeSession(id);
    const next = new Map(byId.value);
    next.delete(id);
    byId.value = next;
  }

  return { list, count, get, connect, refresh, open, remove, wsConnected, wsError };
});
