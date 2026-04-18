<script setup lang="ts">
import { computed, ref } from "vue";
import { RefreshCcw, Trash2, ArrowRight } from "lucide-vue-next";
import { shortIdentity, type SessionSummary } from "@lxi-web/core/browser";
import { useSessionsStore } from "@/stores/sessions";
import DeviceErrorsPill from "./DeviceErrorsPill.vue";
import StatusIndicator from "./StatusIndicator.vue";
import DeviceKindIcon from "./DeviceKindIcon.vue";
import { kindLabel } from "@/lib/labels";

const props = defineProps<{ session: SessionSummary }>();

const sessions = useSessionsStore();
const reconnecting = ref(false);
const reconnectError = ref<string | null>(null);

const title = computed(() => {
  if (props.session.identity) return shortIdentity(props.session.identity);
  return "Connecting…";
});

const subtitle = computed(
  () => `${props.session.host}:${props.session.port} — ${kindLabel(props.session.kind)}`,
);

const ariaSummary = computed(() => {
  const status = props.session.status;
  return `${title.value}. ${kindLabel(props.session.kind)}. ${status}.`;
});

const canReconnect = computed(() => props.session.status === "error");

async function disconnect(): Promise<void> {
  if (!window.confirm(`Disconnect from ${title.value}?`)) return;
  await sessions.remove(props.session.id);
}

async function reconnect(): Promise<void> {
  if (reconnecting.value) return;
  reconnecting.value = true;
  reconnectError.value = null;
  try {
    await sessions.reconnect(props.session.id);
  } catch (err) {
    reconnectError.value = err instanceof Error ? err.message : String(err);
  } finally {
    reconnecting.value = false;
  }
}
</script>

<template>
  <article
    class="group flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4 shadow-sm transition-shadow focus-within:shadow-md hover:shadow-md"
    :aria-label="ariaSummary"
  >
    <header class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <span
          class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-3 text-accent"
          aria-hidden="true"
        >
          <DeviceKindIcon :kind="session.kind" />
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold">{{ title }}</h2>
          <p class="truncate text-xs text-fg-muted">{{ subtitle }}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <DeviceErrorsPill
          v-if="session.kind !== 'unknown'"
          :session-id="session.id"
          :active="session.status === 'connected'"
          compact
        />
        <StatusIndicator :status="session.status" />
      </div>
    </header>

    <slot name="body" />

    <div v-if="session.error || reconnectError" class="flex flex-col gap-1">
      <p
        v-if="session.error"
        class="rounded-md border border-state-error/30 bg-state-error/10 px-2 py-1 text-xs text-state-error"
        role="alert"
      >
        {{ session.error.message }}
      </p>
      <p
        v-if="reconnectError"
        class="rounded-md border border-state-error/30 bg-state-error/10 px-2 py-1 text-xs text-state-error"
        role="alert"
      >
        {{ reconnectError }}
      </p>
    </div>

    <footer class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
      <router-link
        :to="{ name: 'device', params: { sessionId: session.id } }"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Open
        <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
      </router-link>
      <div class="flex items-center gap-1">
        <button
          v-if="canReconnect"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-accent/40 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="reconnecting"
          @click="reconnect"
        >
          <RefreshCcw
            class="h-3.5 w-3.5"
            :class="reconnecting ? 'animate-spin' : ''"
            aria-hidden="true"
          />
          {{ reconnecting ? "Reconnecting…" : "Reconnect" }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-state-error/10 hover:text-state-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-error"
          @click="disconnect"
        >
          <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
          Disconnect
        </button>
      </div>
    </footer>
  </article>
</template>
