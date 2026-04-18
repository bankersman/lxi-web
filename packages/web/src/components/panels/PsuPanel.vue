<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { api } from "@/api/client";
import { usePolling } from "@/composables/usePolling";
import { formatSi } from "@/lib/format";
import type { PsuChannelState } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const { data, error, refresh } = usePolling<PsuChannelState[]>(
  () => api.getPsuChannels(props.sessionId),
  { intervalMs: 1500, enabled: computed(() => props.enabled) },
);

const draft = reactive<Record<number, { voltage: number; current: number }>>({});

watch(data, (channels) => {
  if (!channels) return;
  for (const ch of channels) {
    if (!(ch.id in draft)) {
      draft[ch.id] = { voltage: ch.setVoltage, current: ch.setCurrent };
    }
  }
});

async function apply(channel: PsuChannelState): Promise<void> {
  const values = draft[channel.id];
  if (!values) return;
  await api.setPsuChannel(props.sessionId, channel.id, values);
  await refresh();
}

async function toggleOutput(channel: PsuChannelState): Promise<void> {
  await api.setPsuChannelOutput(props.sessionId, channel.id, !channel.output);
  await refresh();
}
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
    <section
      v-for="ch in data ?? []"
      :key="ch.id"
      class="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <header class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold">{{ ch.label }}</h3>
          <p class="text-xs text-fg-muted">
            Limits {{ formatSi(ch.limits.voltageMax, "V", 2) }} /
            {{ formatSi(ch.limits.currentMax, "A", 2) }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="
            ch.output
              ? 'bg-state-connected/15 text-state-connected hover:bg-state-connected/25'
              : 'bg-surface-3 text-fg-muted hover:bg-surface'
          "
          :aria-pressed="ch.output"
          @click="toggleOutput(ch)"
        >
          Output {{ ch.output ? "ON" : "OFF" }}
        </button>
      </header>

      <div class="grid grid-cols-2 gap-3 rounded-md bg-surface-3 p-3 font-mono">
        <div>
          <p class="text-[10px] uppercase tracking-wide text-fg-muted">Voltage</p>
          <p class="text-lg font-semibold tabular-nums">
            {{ formatSi(ch.measuredVoltage, "V", 3) }}
          </p>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-wide text-fg-muted">Current</p>
          <p class="text-lg font-semibold tabular-nums">
            {{ formatSi(ch.measuredCurrent, "A", 3) }}
          </p>
        </div>
      </div>

      <form class="flex flex-col gap-2 text-xs" @submit.prevent="apply(ch)">
        <label class="flex items-center justify-between gap-2">
          <span class="text-fg-muted">Set voltage (V)</span>
          <input
            v-model.number="draft[ch.id].voltage"
            type="number"
            step="any"
            :min="0"
            :max="ch.limits.voltageMax"
            class="h-8 w-28 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        <label class="flex items-center justify-between gap-2">
          <span class="text-fg-muted">Set current (A)</span>
          <input
            v-model.number="draft[ch.id].current"
            type="number"
            step="any"
            :min="0"
            :max="ch.limits.currentMax"
            class="h-8 w-28 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        <button
          type="submit"
          class="mt-1 inline-flex items-center justify-center rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Apply
        </button>
      </form>
    </section>

    <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
  </div>
</template>
