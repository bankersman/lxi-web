<script setup lang="ts">
import { computed } from "vue";
import { api } from "@/api/client";
import { usePolling } from "@/composables/usePolling";
import { formatSi } from "@/lib/format";
import type { PsuChannelState } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const { data, error } = usePolling<PsuChannelState[]>(
  () => api.getPsuChannels(props.sessionId),
  { intervalMs: 2000, enabled: computed(() => props.enabled) },
);

async function toggleOutput(channel: PsuChannelState): Promise<void> {
  try {
    await api.setPsuChannelOutput(props.sessionId, channel.id, !channel.output);
  } catch {
    // next poll surfaces issues via `error`
  }
}
</script>

<template>
  <div class="flex flex-col gap-1" aria-live="polite">
    <div
      v-for="ch in data ?? []"
      :key="ch.id"
      class="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-3 px-2 py-1.5 text-xs"
    >
      <span class="font-medium">{{ ch.label }}</span>
      <span class="font-mono text-fg-muted">
        {{ formatSi(ch.measuredVoltage, "V", 3) }} / {{ formatSi(ch.measuredCurrent, "A", 3) }}
      </span>
      <button
        type="button"
        class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="
          ch.output
            ? 'bg-state-connected/15 text-state-connected hover:bg-state-connected/25'
            : 'bg-surface-2 text-fg-muted hover:bg-surface'
        "
        :aria-pressed="ch.output"
        @click="toggleOutput(ch)"
      >
        {{ ch.output ? "ON" : "OFF" }}
      </button>
    </div>
    <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
  </div>
</template>
