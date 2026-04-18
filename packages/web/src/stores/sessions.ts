import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  ClientMessage,
  ServerMessage,
  SessionSummary,
  WsSubscriptionTopic,
} from "@lxi-web/core/browser";
import { api } from "@/api/client";
import { useSavedConnectionsStore } from "./savedConnections";

type TopicKey = `${string}::${WsSubscriptionTopic}`;

interface TopicListener {
  onUpdate(payload: unknown, measuredAt: number): void;
  onError(message: string, at: number): void;
}

/**
 * Live source of truth for all connected (and connecting / errored) instrument
 * sessions, and the single WebSocket used for both:
 *
 * - **session registry** — emits `sessions:init` on connect and
 *   `sessions:update` / `sessions:removed` on every lifecycle change.
 * - **live readings** — panels call {@link subscribeTopic} to receive
 *   `reading:update` / `reading:error` frames for a topic (e.g.
 *   `"dmm.reading"`). The store reference-counts local subscribers so the
 *   server only sees one `subscribe` / `unsubscribe` per session+topic and
 *   multiple mounted panels (detail + dashboard tile) share the same feed.
 *
 * On reconnect the store re-sends every `subscribe` so live readings resume
 * without any panel-side retry logic.
 */
export const useSessionsStore = defineStore("sessions", () => {
  const byId = ref<Map<string, SessionSummary>>(new Map());
  const wsConnected = ref(false);
  const wsError = ref<string | null>(null);
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Map<TopicKey, Set<TopicListener>>();
  const subscribedOnServer = new Set<TopicKey>();

  const list = computed<readonly SessionSummary[]>(() =>
    Array.from(byId.value.values()).sort((a, b) => a.openedAt - b.openedAt),
  );
  const count = computed(() => byId.value.size);

  function get(id: string): SessionSummary | undefined {
    return byId.value.get(id);
  }

  function keyOf(sessionId: string, topic: WsSubscriptionTopic): TopicKey {
    return `${sessionId}::${topic}` as TopicKey;
  }

  let autoReopenDone = false;

  function apply(message: ServerMessage): void {
    if (message.type === "sessions:init") {
      const next = new Map<string, SessionSummary>();
      for (const s of message.sessions) next.set(s.id, s);
      byId.value = next;
      if (!autoReopenDone) {
        autoReopenDone = true;
        void reopenAutoConnects();
      }
    } else if (message.type === "sessions:update") {
      const next = new Map(byId.value);
      next.set(message.session.id, message.session);
      byId.value = next;
    } else if (message.type === "sessions:removed") {
      const next = new Map(byId.value);
      next.delete(message.id);
      byId.value = next;
      for (const [key, set] of listeners) {
        if (key.startsWith(`${message.id}::`)) {
          listeners.delete(key);
          subscribedOnServer.delete(key);
          for (const l of set) {
            l.onError("session closed", Date.now());
          }
        }
      }
    } else if (message.type === "reading:update") {
      const set = listeners.get(keyOf(message.sessionId, message.topic));
      if (!set) return;
      for (const l of set) l.onUpdate(message.payload, message.measuredAt);
    } else if (message.type === "reading:error") {
      const set = listeners.get(keyOf(message.sessionId, message.topic));
      if (!set) return;
      for (const l of set) l.onError(message.message, message.at);
    } else if (message.type === "deviceErrors:batch") {
      const set = listeners.get(keyOf(message.sessionId, "device.errors"));
      if (!set) return;
      for (const l of set) l.onUpdate(message.entries, message.at);
    } else if (message.type === "sessionTranscript:batch") {
      const set = listeners.get(keyOf(message.sessionId, "session.transcript"));
      if (!set) return;
      for (const l of set) l.onUpdate(message.entries, message.at);
    }
  }

  function send(message: ClientMessage): boolean {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(message));
    return true;
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
      // Re-send every active subscription so live readings resume after a
      // server restart or network blip without any component-side state.
      for (const key of listeners.keys()) {
        const sep = key.indexOf("::");
        const sessionId = key.slice(0, sep);
        const topic = key.slice(sep + 2) as WsSubscriptionTopic;
        send({ type: "subscribe", sessionId, topic });
        subscribedOnServer.add(key);
      }
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
      subscribedOnServer.clear();
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

  /**
   * Register `listener` for live frames on `(sessionId, topic)`. Returns an
   * `unsubscribe` function — call it on component unmount. The store only
   * sends `subscribe` to the server on the first listener and `unsubscribe`
   * on the last, so opening the detail page while a dashboard mini panel is
   * already mounted does not double the device traffic.
   */
  function subscribeTopic(
    sessionId: string,
    topic: WsSubscriptionTopic,
    listener: TopicListener,
  ): () => void {
    const key = keyOf(sessionId, topic);
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);
    if (!subscribedOnServer.has(key) && send({ type: "subscribe", sessionId, topic })) {
      subscribedOnServer.add(key);
    }
    return () => {
      const existing = listeners.get(key);
      if (!existing) return;
      existing.delete(listener);
      if (existing.size === 0) {
        listeners.delete(key);
        if (subscribedOnServer.delete(key)) {
          send({ type: "unsubscribe", sessionId, topic });
        }
      }
    };
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
    // Auto-record the address in the browser's saved list so the operator
    // doesn't have to retype it next time. Explicit "Forget" lives in the UI.
    try {
      const saved = useSavedConnectionsStore();
      saved.markConnected(summary.host, summary.port);
    } catch {
      // Pinia may not be installed in some test harnesses; fall through.
    }
    return summary;
  }

  /**
   * Open a session for every saved entry flagged auto-connect that isn't
   * already live. Fires once per page load right after the first
   * `sessions:init` frame so stale entries from a previous server lifetime
   * are honored, but later WebSocket reconnects don't override explicit
   * Disconnect actions.
   */
  async function reopenAutoConnects(): Promise<void> {
    let saved: ReturnType<typeof useSavedConnectionsStore>;
    try {
      saved = useSavedConnectionsStore();
    } catch {
      return;
    }
    const live = new Set<string>();
    for (const s of byId.value.values()) {
      live.add(`${s.host.toLowerCase()}:${s.port}`);
    }
    for (const entry of saved.list) {
      if (!entry.autoConnect) continue;
      const key = `${entry.host.toLowerCase()}:${entry.port}`;
      if (live.has(key)) continue;
      try {
        await open(entry.host, entry.port);
      } catch (err) {
        console.warn(`auto-reopen failed for ${entry.label}:`, err);
      }
    }
  }

  async function remove(id: string): Promise<void> {
    await api.closeSession(id);
    const next = new Map(byId.value);
    next.delete(id);
    byId.value = next;
  }

  /**
   * Ask the server to reopen an errored session in-place. The sessionId does
   * not change, so the current route and any live subscriptions survive the
   * reconnect — we only need to swap in the fresh summary.
   */
  async function reconnect(id: string): Promise<SessionSummary> {
    const summary = await api.reconnectSession(id);
    const next = new Map(byId.value);
    next.set(summary.id, summary);
    byId.value = next;
    return summary;
  }

  return {
    list,
    count,
    get,
    connect,
    refresh,
    open,
    remove,
    reconnect,
    reopenAutoConnects,
    subscribeTopic,
    wsConnected,
    wsError,
  };
});
