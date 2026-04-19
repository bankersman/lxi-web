<script setup lang="ts">
import { computed } from "vue";
import { useLiveReading } from "@/composables/useLiveReading";
import { formatSi, formatTime } from "@/lib/format";
import { multimeterModeLabel } from "@/lib/labels";
import type { MultimeterReading } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const reading = useLiveReading<MultimeterReading>(
  () => props.sessionId,
  "dmm.reading",
  { enabled: computed(() => props.enabled) },
);

const primary = computed(() => {
  const r = reading.data.value;
  if (!r) return { value: "—", unit: "" };
  if (r.overload) return { value: "OVLD", unit: r.unit };
  return { value: formatSi(r.value, r.unit, 5), unit: "" };
});
</script>

<template>
  <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6">
    <h3 class="mb-2 text-sm font-semibold">Multimeter (limited support)</h3>
    <p class="mb-4 text-sm text-fg-muted">
      This model is not the Rigol DM858 family. Only the live reading is shown; use Raw SCPI for full
      control.
    </p>
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-xs text-fg-muted">Reading</span>
      <span
        v-if="reading.data.value"
        class="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
      >
        {{ multimeterModeLabel(reading.data.value.mode) }}
      </span>
    </div>
    <p class="text-center font-mono text-4xl font-semibold tabular-nums" aria-live="polite">
      {{ primary.value }}
    </p>
    <p v-if="reading.data.value" class="mt-1 text-center text-xs text-fg-muted">
      {{ formatTime(reading.data.value.measuredAt) }}
    </p>
    <p v-if="reading.error.value" class="mt-3 text-xs text-state-error" role="alert">
      {{ reading.error.value }}
    </p>
  </section>
</template>
