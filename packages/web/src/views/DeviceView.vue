<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, RefreshCcw } from "lucide-vue-next";
import { shortIdentity } from "@lxi-web/core/browser";
import { useSessionsStore } from "@/stores/sessions";
import AppHeader from "@/components/AppHeader.vue";
import StatusIndicator from "@/components/StatusIndicator.vue";
import DeviceKindIcon from "@/components/DeviceKindIcon.vue";
import ScopePanel from "@/components/panels/ScopePanel.vue";
import PsuPanel from "@/components/panels/PsuPanel.vue";
import DmmPanel from "@/components/panels/DmmPanel.vue";
import RawConsole from "@/components/panels/RawConsole.vue";
import { kindLabel } from "@/lib/labels";

const props = defineProps<{ sessionId: string }>();

const router = useRouter();
const sessions = useSessionsStore();
const session = computed(() => sessions.get(props.sessionId));

const title = computed(() => {
  const s = session.value;
  if (!s) return "Device";
  return s.identity ? shortIdentity(s.identity) : "Connecting…";
});

const isConnected = computed(() => session.value?.status === "connected");
const canReconnect = computed(() => session.value?.status === "error");

const reconnecting = ref(false);
const reconnectError = ref<string | null>(null);

async function reconnect(): Promise<void> {
  const s = session.value;
  if (!s || reconnecting.value) return;
  reconnecting.value = true;
  reconnectError.value = null;
  try {
    await sessions.reconnect(s.id);
  } catch (err) {
    reconnectError.value = err instanceof Error ? err.message : String(err);
  } finally {
    reconnecting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface text-fg">
    <AppHeader />
    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <nav class="mb-4 text-sm">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="router.push('/')"
        >
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </button>
      </nav>

      <section
        v-if="session"
        class="mb-6 rounded-[var(--radius-card)] border border-border bg-surface-2 p-5"
      >
        <header class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <span
              class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-3 text-accent"
              aria-hidden="true"
            >
              <DeviceKindIcon :kind="session.kind" />
            </span>
            <div>
              <h2 class="text-lg font-semibold">{{ title }}</h2>
              <p class="text-xs text-fg-muted">
                {{ kindLabel(session.kind) }} — {{ session.host }}:{{ session.port }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="canReconnect"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
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
            <StatusIndicator :status="session.status" />
          </div>
        </header>
        <p
          v-if="session.error"
          class="mt-3 rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error"
          role="alert"
        >
          {{ session.error.message }}
        </p>
        <p
          v-if="reconnectError"
          class="mt-3 rounded-md border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error"
          role="alert"
        >
          {{ reconnectError }}
        </p>
      </section>

      <template v-if="session">
        <ScopePanel
          v-if="session.kind === 'oscilloscope'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <PsuPanel
          v-else-if="session.kind === 'powerSupply'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <DmmPanel
          v-else-if="session.kind === 'multimeter'"
          :session-id="session.id"
          :enabled="isConnected"
        />
        <RawConsole
          v-else
          :session-id="session.id"
          :disabled="!isConnected"
        />

        <details
          v-if="session.kind !== 'unknown'"
          class="mt-6 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
        >
          <summary class="cursor-pointer text-sm font-semibold">Raw SCPI</summary>
          <div class="mt-3">
            <RawConsole :session-id="session.id" :disabled="!isConnected" />
          </div>
        </details>
      </template>

      <section
        v-else
        class="rounded-[var(--radius-card)] border border-dashed border-border bg-surface-2 p-10 text-center"
      >
        <h2 class="text-sm font-semibold">Unknown session</h2>
        <p class="mt-1 text-sm text-fg-muted">
          The session <code>{{ sessionId }}</code> is not in the live list. It may
          have been disconnected.
        </p>
      </section>
    </main>
  </div>
</template>
