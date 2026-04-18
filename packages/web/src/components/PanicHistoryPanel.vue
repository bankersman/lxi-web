<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import type { PanicResult } from "@lxi-web/core/browser";
import { api } from "@/api/client";
import { useSessionsStore } from "@/stores/sessions";

const sessions = useSessionsStore();
const history = ref<readonly PanicResult[]>([]);
const open = ref(false);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const rows = await api.getPanicHistory();
    history.value = [...rows].reverse();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(() => {
  void load();
});

watch(
  () => sessions.panicEpoch,
  () => {
    void load();
  },
);

function worstKind(r: PanicResult): string {
  if (r.touchedSessions.some((t) => t.outcome.kind === "error")) return "error";
  if (r.touchedSessions.some((t) => t.outcome.kind === "partial")) return "partial";
  if (r.touchedSessions.length === 0) return "none";
  return "ok";
}
</script>

<template>
  <section class="rounded-[var(--radius-card)] border border-border bg-surface-2">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-surface-3/60"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span>Panic history</span>
      <span class="text-xs font-normal text-fg-muted">{{ history.length }} on server</span>
    </button>
    <div v-show="open" class="border-t border-border px-3 py-2">
      <p v-if="loadError" class="text-xs text-red-600">{{ loadError }}</p>
      <p v-else-if="history.length === 0" class="text-xs text-fg-muted">No panic invocations yet.</p>
      <div v-else class="max-h-64 overflow-auto">
        <table class="w-full border-collapse text-left text-xs">
          <thead class="sticky top-0 bg-surface-2 text-fg-muted">
            <tr>
              <th class="py-1 pr-2">Time</th>
              <th class="py-1 pr-2">Outcome</th>
              <th class="py-1 pr-2">Touched</th>
              <th class="py-1">Transcript</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, idx) in history" :key="idx" class="border-t border-border/50">
              <td class="py-1 pr-2 whitespace-nowrap text-fg-muted">{{ r.startedAt }}</td>
              <td class="py-1 pr-2">{{ worstKind(r) }}</td>
              <td class="py-1 pr-2 tabular-nums">{{ r.touchedSessions.length }}</td>
              <td class="py-1">
                <RouterLink
                  v-for="t in r.touchedSessions"
                  :key="t.sessionId"
                  class="mr-2 inline-block text-accent underline-offset-2 hover:underline"
                  :to="{ name: 'device', params: { sessionId: t.sessionId }, query: { origin: 'panic' } }"
                >
                  {{ t.sessionId.slice(0, 8) }}…
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
