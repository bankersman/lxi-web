<script setup lang="ts">
import { computed } from "vue";
import { api, type SgChannelsInfo } from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { formatSi } from "@/lib/format";
import { signalGeneratorWaveformLabel } from "@/lib/labels";
import type { SignalGeneratorChannelState } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const { data, error } = useLiveReading<readonly SignalGeneratorChannelState[]>(
  () => props.sessionId,
  "sg.channels",
  { enabled: computed(() => props.enabled) },
);

const channels = computed<readonly SignalGeneratorChannelState[]>(
  () => data.value ?? [],
);

async function toggleChannel(ch: SignalGeneratorChannelState): Promise<void> {
  try {
    await api.setSgEnabled(props.sessionId, ch.id, !ch.enabled);
  } catch {
    // next live tick surfaces the error
  }
}

// Kept to satisfy unused-type warnings during scaffolding.
void ({} as SgChannelsInfo);
</script>

<template>
  <div class="flex flex-col gap-2" aria-live="polite">
    <div
      v-for="ch in channels"
      :key="ch.id"
      class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-3 px-3 py-2"
    >
      <div class="flex items-center gap-2">
        <span
          class="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
        >
          {{ ch.label ?? `CH${ch.id}` }}
        </span>
        <span class="font-mono text-xs tabular-nums">
          {{ signalGeneratorWaveformLabel(ch.waveform.type) }}
          ·
          {{ formatSi(ch.actual.frequencyHz, "Hz", 3) }}
        </span>
      </div>
      <button
        type="button"
        class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="
          ch.enabled
            ? 'bg-state-connected/15 text-state-connected hover:bg-state-connected/25'
            : 'bg-surface-2 text-fg-muted hover:bg-surface'
        "
        :aria-pressed="ch.enabled"
        :disabled="!enabled"
        @click="toggleChannel(ch)"
      >
        {{ ch.enabled ? "OUT ON" : "OUT OFF" }}
      </button>
    </div>
    <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
  </div>
</template>
