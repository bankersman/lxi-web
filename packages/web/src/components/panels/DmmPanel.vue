<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "@/api/client";
import { usePolling } from "@/composables/usePolling";
import { formatSi, formatTime } from "@/lib/format";
import { multimeterModeLabel } from "@/lib/labels";
import type { MultimeterMode, MultimeterReading } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const supported = ref<readonly MultimeterMode[]>([]);
const selectedMode = ref<MultimeterMode | null>(null);
const history = ref<MultimeterReading[]>([]);

void (async () => {
  try {
    const { mode, supported: modes } = await api.getDmmMode(props.sessionId);
    supported.value = modes;
    selectedMode.value = mode;
  } catch {
    // ignore — polling will surface errors
  }
})();

const reading = usePolling<MultimeterReading>(
  () => api.getDmmReading(props.sessionId),
  { intervalMs: 750, enabled: computed(() => props.enabled) },
);

watch(reading.data, (r) => {
  if (!r) return;
  selectedMode.value = r.mode;
  history.value = [r, ...history.value].slice(0, 20);
});

async function changeMode(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as MultimeterMode;
  selectedMode.value = value;
  await api.setDmmMode(props.sessionId, value);
  history.value = [];
  await reading.refresh();
}

const primary = computed(() => {
  const r = reading.data.value;
  if (!r) return { value: "—", unit: "" };
  if (r.overload) return { value: "OVLD", unit: r.unit };
  return { value: formatSi(r.value, r.unit, 5), unit: "" };
});
</script>

<template>
  <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
    <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6">
      <div class="mb-4 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">Primary reading</h3>
        <span
          v-if="reading.data.value"
          class="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
        >
          {{ multimeterModeLabel(reading.data.value.mode) }}
        </span>
      </div>
      <p
        class="text-center font-mono text-5xl font-semibold tabular-nums"
        aria-live="polite"
      >
        {{ primary.value }}
      </p>
      <p
        v-if="reading.data.value"
        class="mt-1 text-center text-xs text-fg-muted"
      >
        Measured {{ formatTime(reading.data.value.measuredAt) }}
      </p>
      <p v-if="reading.error.value" class="mt-3 text-xs text-state-error" role="alert">
        {{ reading.error.value }}
      </p>
    </section>

    <aside class="flex flex-col gap-4">
      <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <label for="dmm-mode" class="text-xs text-fg-muted">Measurement mode</label>
        <select
          id="dmm-mode"
          :value="selectedMode ?? ''"
          class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @change="changeMode"
        >
          <option v-for="m in supported" :key="m" :value="m">
            {{ multimeterModeLabel(m) }}
          </option>
        </select>
      </section>

      <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <h3 class="mb-2 text-sm font-semibold">Recent readings</h3>
        <ol class="flex flex-col gap-1 font-mono text-xs">
          <li
            v-for="(r, i) in history"
            :key="i"
            class="flex items-center justify-between rounded-md bg-surface-3 px-2 py-1"
          >
            <span class="text-fg-muted">{{ formatTime(r.measuredAt) }}</span>
            <span>{{ r.overload ? "OVLD" : formatSi(r.value, r.unit, 4) }}</span>
          </li>
          <li v-if="history.length === 0" class="text-xs text-fg-muted">No readings yet.</li>
        </ol>
      </section>
    </aside>
  </div>
</template>
