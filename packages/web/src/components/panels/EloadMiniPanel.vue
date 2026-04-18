<script setup lang="ts">
import { computed } from "vue";
import { api } from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { formatSi } from "@/lib/format";
import { electronicLoadModeLabel } from "@/lib/labels";
import type { ElectronicLoadState } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const { data, error } = useLiveReading<ElectronicLoadState>(
  () => props.sessionId,
  "eload.state",
  { enabled: computed(() => props.enabled) },
);

const tripped = computed(() => {
  const p = data.value?.protection;
  if (!p) return false;
  return Object.values(p).some((entry) => entry?.tripped);
});

async function toggleInput(): Promise<void> {
  if (!data.value) return;
  try {
    await api.setEloadEnabled(props.sessionId, !data.value.enabled);
  } catch {
    // next live tick surfaces the error
  }
}
</script>

<template>
  <div class="flex flex-col gap-2" aria-live="polite">
    <div
      class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-3 px-3 py-2"
    >
      <span
        v-if="data"
        class="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
      >
        {{ electronicLoadModeLabel(data.mode) }}
      </span>
      <span
        v-if="tripped"
        class="inline-flex items-center rounded-full bg-state-error/15 px-2 py-0.5 text-[11px] font-medium uppercase text-state-error"
      >
        Tripped
      </span>
      <button
        v-if="data"
        type="button"
        class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="
          data.enabled
            ? 'bg-state-connected/15 text-state-connected hover:bg-state-connected/25'
            : 'bg-surface-2 text-fg-muted hover:bg-surface'
        "
        :aria-pressed="data.enabled"
        @click="toggleInput"
      >
        {{ data.enabled ? "LOAD ON" : "LOAD OFF" }}
      </button>
    </div>
    <div
      v-if="data"
      class="grid grid-cols-3 gap-2 rounded-md border border-border bg-surface-3 px-3 py-2 text-center font-mono text-xs tabular-nums"
    >
      <div>
        <p class="text-[10px] uppercase text-fg-muted">V</p>
        <p>{{ formatSi(data.measurement.voltage, "V", 3) }}</p>
      </div>
      <div>
        <p class="text-[10px] uppercase text-fg-muted">I</p>
        <p>{{ formatSi(data.measurement.current, "A", 3) }}</p>
      </div>
      <div>
        <p class="text-[10px] uppercase text-fg-muted">P</p>
        <p>{{ formatSi(data.measurement.power, "W", 3) }}</p>
      </div>
    </div>
    <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
  </div>
</template>
