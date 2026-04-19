<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Download, Pause, Play } from "lucide-vue-next";
import type { TranscriptEntry, TranscriptOrigin } from "@lxi-web/core/browser";
import { api } from "@/api/client";
import { useSessionsStore } from "@/stores/sessions";

const props = defineProps<{
  sessionId: string;
  readonly disabled?: boolean;
  /** When true, only transcript lines whose origin is `panic` are shown. */
  readonly panicFilterOnly?: boolean;
}>();

const sessions = useSessionsStore();
const entries = ref<TranscriptEntry[]>([]);
const maxSeq = ref(0);
const filterText = ref("");
const paused = ref(false);
const showDriver = ref(true);
const showPoller = ref(true);
const showOther = ref(true);

function formatOrigin(o: TranscriptOrigin): string {
  switch (o.kind) {
    case "driver":
      return `driver:${o.method}`;
    case "poller":
      return `poller:${o.topic}`;
    case "errorQueue":
      return "errorQueue";
    case "rawScpi":
      return "rawScpi";
    case "action":
      return `action:${o.actionId}`;
    case "panic":
      return "panic";
    default:
      return "unknown";
  }
}

const filtered = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  const list = entries.value.filter((e) => {
    if (props.panicFilterOnly && e.origin.kind !== "panic") return false;
    if (!showDriver.value && e.origin.kind === "driver") return false;
    if (!showPoller.value && e.origin.kind === "poller") return false;
    if (
      !showOther.value &&
      e.origin.kind !== "driver" &&
      e.origin.kind !== "poller"
    ) {
      return false;
    }
    if (!q) return true;
    const hay = `${e.command} ${e.response ?? ""} ${formatOrigin(e.origin)}`.toLowerCase();
    return hay.includes(q);
  });
  return list.sort((a, b) => b.seq - a.seq);
});

async function loadInitial(): Promise<void> {
  if (props.disabled) return;
  try {
    const page = await api.getTranscriptPage(props.sessionId, 0, 2000);
    entries.value = page.entries;
    maxSeq.value = page.maxSeq;
  } catch {
    /* ignore */
  }
}

let unsub: (() => void) | null = null;
let lastSession = "";

watch(
  () => [props.sessionId, props.disabled, paused.value] as const,
  ([id, dis, pause]) => {
    if (unsub) {
      unsub();
      unsub = null;
    }
    if (dis) return;
    if (id !== lastSession) {
      lastSession = id;
      entries.value = [];
      maxSeq.value = 0;
      void loadInitial();
    }
    if (pause) return;
    unsub = sessions.subscribeTopic(id, "session.transcript", {
      onUpdate(batch: unknown) {
        const b = batch as TranscriptEntry[];
        const map = new Map(entries.value.map((e) => [e.seq, e]));
        for (const e of b) map.set(e.seq, e);
        entries.value = [...map.values()].sort((a, b) => a.seq - b.seq);
        if (b.length > 0) {
          maxSeq.value = Math.max(maxSeq.value, ...b.map((x) => x.seq));
        }
      },
      onError() {
        /* ignore */
      },
    });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unsub?.();
});

const dirGlyph = (d: TranscriptEntry["direction"]): string => {
  switch (d) {
    case "write":
    case "block-write":
      return "→";
    case "query":
    case "block-query":
      return "←";
    default:
      return "·";
  }
};
</script>

<template>
  <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <h3 class="text-sm font-semibold">Session transcript</h3>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
        :aria-pressed="paused"
        @click="paused = !paused"
      >
        <Pause v-if="!paused" class="h-3.5 w-3.5" aria-hidden="true" />
        <Play v-else class="h-3.5 w-3.5" aria-hidden="true" />
        {{ paused ? "Resume" : "Pause" }} tail
      </button>
      <a
        class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-3"
        :href="api.transcriptExportUrl(sessionId)"
        download
        rel="noopener"
      >
        <Download class="h-3.5 w-3.5" aria-hidden="true" />
        Download NDJSON
      </a>
    </div>
    <label class="mb-2 block text-xs text-fg-muted">
      Filter
      <input
        v-model="filterText"
        type="search"
        class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs"
        placeholder="Substring match…"
      />
    </label>
    <div class="mb-2 flex flex-wrap gap-3 text-[11px] text-fg-muted">
      <label class="flex items-center gap-1">
        <input v-model="showDriver" type="checkbox" />
        Driver
      </label>
      <label class="flex items-center gap-1">
        <input v-model="showPoller" type="checkbox" />
        Poller
      </label>
      <label class="flex items-center gap-1">
        <input v-model="showOther" type="checkbox" />
        Other
      </label>
    </div>
    <div
      class="max-h-[28rem] overflow-auto rounded-md border border-border font-mono text-[11px]"
      role="log"
      aria-live="off"
    >
      <table class="w-full border-collapse text-left">
        <thead class="sticky top-0 bg-surface-2 text-fg-muted">
          <tr>
            <th class="px-2 py-1">#</th>
            <th class="px-2 py-1">Time</th>
            <th class="px-2 py-1">Dir</th>
            <th class="px-2 py-1">Origin</th>
            <th class="px-2 py-1">Command</th>
            <th class="px-2 py-1">Response</th>
            <th class="px-2 py-1">ms</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in filtered"
            :key="e.seq"
            class="border-t border-border/40 odd:bg-surface/30"
          >
            <td class="px-2 py-0.5 tabular-nums">{{ e.seq }}</td>
            <td class="px-2 py-0.5 whitespace-nowrap text-fg-muted">{{ e.timestamp }}</td>
            <td class="px-2 py-0.5" :title="e.direction">{{ dirGlyph(e.direction) }}</td>
            <td class="max-w-[8rem] truncate px-2 py-0.5" :title="formatOrigin(e.origin)">
              {{ formatOrigin(e.origin) }}
            </td>
            <td class="max-w-[14rem] break-all px-2 py-0.5">{{ e.command }}</td>
            <td class="max-w-[14rem] break-all px-2 py-0.5 text-fg-muted">
              {{ e.response ?? "—" }}
            </td>
            <td class="px-2 py-0.5 tabular-nums">{{ e.elapsedMs.toFixed(1) }}</td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="7" class="px-2 py-4 text-center text-fg-muted">
              No transcript lines match.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
