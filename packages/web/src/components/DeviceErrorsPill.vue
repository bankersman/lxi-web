<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { DeviceErrorEntry } from "@lxi-web/core/browser";
import { api } from "@/api/client";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";
import { useSessionsStore } from "@/stores/sessions";

const props = defineProps<{
  sessionId: string;
  /** When false, hide entirely (e.g. unknown kind). */
  readonly active: boolean;
  /** Compact styling for dashboard cards. */
  readonly compact?: boolean;
}>();

const sessions = useSessionsStore();
const gate = useSafeModeGate();
const clearLocked = computed(() => gate.enabled);
const clearTitle = computed(() => (gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined));
const entries = ref<DeviceErrorEntry[]>([]);
const open = ref(false);
const busy = ref(false);

const count = computed(() => entries.value.length);

const worstTone = computed(() => {
  let hasRed = false;
  let hasAmber = false;
  for (const e of entries.value) {
    const c = e.code;
    if (c <= -400 && c > -500) hasRed = true;
    else if (c <= -100 && c > -300) hasAmber = true;
  }
  if (hasRed) return "red";
  if (hasAmber) return "amber";
  return "neutral";
});

const summaryId = `device-err-summary-${props.sessionId}`;

async function refresh(): Promise<void> {
  if (!props.active) return;
  try {
    entries.value = await api.getDeviceErrors(props.sessionId);
  } catch {
    /* ignore */
  }
}

let unsub: (() => void) | null = null;

watch(
  () => [props.sessionId, props.active] as const,
  ([id, active]) => {
    if (unsub) {
      unsub();
      unsub = null;
    }
    entries.value = [];
    if (!active) return;
    void refresh();
    unsub = sessions.subscribeTopic(id, "device.errors", {
      onUpdate(batch: unknown) {
        const b = batch as DeviceErrorEntry[];
        const next = [...entries.value];
        for (const e of b) next.push(e);
        while (next.length > 200) next.shift();
        entries.value = next;
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

async function clearErrors(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.clearDeviceErrors(props.sessionId);
    entries.value = [];
    open.value = false;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="active" class="relative inline-flex items-center">
    <button
      type="button"
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      :class="{
        'border-state-error/40 bg-state-error/10 text-state-error': worstTone === 'red',
        'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200':
          worstTone === 'amber',
        'border-border bg-surface-3 text-fg-muted': worstTone === 'neutral',
        'min-h-[1.5rem]': compact,
      }"
      :aria-expanded="open"
      :aria-describedby="summaryId"
      @click="open = !open"
    >
      <span class="tabular-nums" aria-hidden="true">{{ count }}</span>
      <span>{{ count === 1 ? "device error" : "device errors" }}</span>
    </button>
    <p :id="summaryId" class="sr-only">
      Instrument error queue: {{ count }} entr{{ count === 1 ? "y" : "ies" }}.
      Open for details and clear.
    </p>

    <div
      v-if="open"
      class="absolute right-0 top-full z-20 mt-1 w-80 max-w-[90vw] rounded-md border border-border bg-surface-2 p-3 shadow-lg"
      role="dialog"
      aria-label="Device errors"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-xs font-semibold">Device errors</h3>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-[11px] text-fg-muted hover:bg-surface-3"
          @click="open = false"
        >
          Close
        </button>
      </div>
      <ol
        class="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px]"
        aria-live="polite"
      >
        <li
          v-for="(e, i) in [...entries].reverse()"
          :key="`${e.timestamp}-${e.code}-${i}`"
          class="rounded border border-border/50 px-2 py-1"
        >
          <span class="text-fg-muted">{{ e.timestamp }}</span>
          <span class="ml-2 tabular-nums">{{ e.code }}</span>
          <span class="ml-1">{{ e.message }}</span>
        </li>
        <li v-if="entries.length === 0" class="text-fg-muted">No errors in buffer.</li>
      </ol>
      <button
        type="button"
        class="mt-2 w-full rounded-md border border-border py-1.5 text-xs font-medium hover:bg-surface-3 disabled:opacity-50"
        :disabled="busy || entries.length === 0 || clearLocked"
        :aria-disabled="busy || entries.length === 0 || clearLocked"
        :title="clearTitle"
        @click="clearErrors"
      >
        Clear buffer
      </button>
    </div>
  </div>
</template>
