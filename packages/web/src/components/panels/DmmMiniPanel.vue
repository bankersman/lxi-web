<script setup lang="ts">
import { computed } from "vue";
import { useLiveReading } from "@/composables/useLiveReading";
import { formatSi } from "@/lib/format";
import { multimeterModeLabel } from "@/lib/labels";
import type { MultimeterReading } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const { data, error } = useLiveReading<MultimeterReading>(
  () => props.sessionId,
  "dmm.reading",
  { enabled: computed(() => props.enabled) },
);

const display = computed(() => {
  const r = data.value;
  if (!r) return "—";
  if (r.overload) return "OVLD";
  return formatSi(r.value, r.unit, 4);
});
</script>

<template>
  <div
    class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-3 px-3 py-2"
    aria-live="polite"
  >
    <span
      v-if="data"
      class="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
    >
      {{ multimeterModeLabel(data.mode) }}
    </span>
    <span class="font-mono text-sm font-semibold tabular-nums">{{ display }}</span>
  </div>
  <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
</template>
