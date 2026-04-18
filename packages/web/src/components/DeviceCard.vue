<script setup lang="ts">
import { computed } from "vue";
import { Trash2, ArrowRight } from "lucide-vue-next";
import { shortIdentity, type SessionSummary } from "@lxi-web/core/browser";
import { useSessionsStore } from "@/stores/sessions";
import StatusIndicator from "./StatusIndicator.vue";
import DeviceKindIcon from "./DeviceKindIcon.vue";
import { kindLabel } from "@/lib/labels";

const props = defineProps<{ session: SessionSummary }>();

const sessions = useSessionsStore();

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

async function disconnect(): Promise<void> {
  if (!window.confirm(`Disconnect from ${title.value}?`)) return;
  await sessions.remove(props.session.id);
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
      <StatusIndicator :status="session.status" />
    </header>

    <slot name="body" />

    <p
      v-if="session.error"
      class="rounded-md border border-state-error/30 bg-state-error/10 px-2 py-1 text-xs text-state-error"
      role="alert"
    >
      {{ session.error.message }}
    </p>

    <footer class="mt-auto flex items-center justify-between gap-2 pt-2">
      <router-link
        :to="{ name: 'device', params: { sessionId: session.id } }"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Open
        <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
      </router-link>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-state-error/10 hover:text-state-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-error"
        @click="disconnect"
      >
        <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
        Disconnect
      </button>
    </footer>
  </article>
</template>
