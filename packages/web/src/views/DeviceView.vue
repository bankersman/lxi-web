<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft } from "lucide-vue-next";
import { shortIdentity } from "@lxi-web/core/browser";
import { useSessionsStore } from "@/stores/sessions";
import AppHeader from "@/components/AppHeader.vue";
import StatusIndicator from "@/components/StatusIndicator.vue";
import DeviceKindIcon from "@/components/DeviceKindIcon.vue";
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
          <StatusIndicator :status="session.status" />
        </header>
        <p class="mt-4 text-sm text-fg-muted">
          Full controls are being wired up in Epic 2.4. This view is live and will
          grow per-kind panels next.
        </p>
      </section>

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
