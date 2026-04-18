<script setup lang="ts">
import { computed } from "vue";
import { useLiveReading } from "@/composables/useLiveReading";
import { formatSi } from "@/lib/format";
import type { SpectrumAnalyzerMarkerReading } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

interface SaTracePayload {
  readonly id: number;
  readonly points: number;
  readonly frequencyHz: readonly number[];
  readonly amplitude: readonly number[];
}

const { data: trace, error: traceError } = useLiveReading<SaTracePayload>(
  () => props.sessionId,
  "sa.trace",
  { enabled: computed(() => props.enabled) },
);

const { data: markers } = useLiveReading<
  readonly SpectrumAnalyzerMarkerReading[]
>(() => props.sessionId, "sa.markers", {
  enabled: computed(() => props.enabled),
});

const activeMarker = computed(() =>
  (markers.value ?? []).find((m) => m.enabled) ?? null,
);

const peakFrequency = computed(() => {
  const data = trace.value;
  if (!data || data.amplitude.length === 0) return null;
  let peakIdx = 0;
  let peak = data.amplitude[0]!;
  for (let i = 1; i < data.amplitude.length; i += 1) {
    if (data.amplitude[i]! > peak) {
      peak = data.amplitude[i]!;
      peakIdx = i;
    }
  }
  return { frequencyHz: data.frequencyHz[peakIdx]!, amplitude: peak };
});

const sparklinePath = computed(() => {
  const data = trace.value;
  if (!data || data.points < 2) return "";
  const amp = data.amplitude;
  let min = Infinity;
  let max = -Infinity;
  for (const a of amp) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  const range = Math.max(0.01, max - min);
  const step = 100 / (data.points - 1);
  let path = "";
  for (let i = 0; i < data.points; i += 1) {
    const x = i * step;
    const y = 20 - ((amp[i]! - min) / range) * 20;
    path += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return path.trim();
});
</script>

<template>
  <div class="flex flex-col gap-2" aria-live="polite">
    <div class="rounded-md border border-border bg-surface-3 px-3 py-2">
      <svg
        v-if="sparklinePath"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        class="h-10 w-full text-accent"
        role="img"
        aria-label="Latest spectrum trace"
      >
        <path
          :d="sparklinePath"
          fill="none"
          stroke="currentColor"
          stroke-width="0.4"
        />
      </svg>
      <p v-else class="text-xs text-fg-muted">Waiting for trace…</p>
    </div>

    <dl class="grid grid-cols-2 gap-2 text-xs">
      <div class="flex flex-col">
        <dt class="text-fg-muted">Peak</dt>
        <dd class="font-mono tabular-nums">
          <template v-if="peakFrequency">
            {{ formatSi(peakFrequency.frequencyHz, "Hz", 3) }} ·
            {{ peakFrequency.amplitude.toFixed(1) }} dBm
          </template>
          <template v-else>—</template>
        </dd>
      </div>
      <div class="flex flex-col">
        <dt class="text-fg-muted">M1</dt>
        <dd class="font-mono tabular-nums">
          <template v-if="activeMarker">
            {{ formatSi(activeMarker.frequencyHz, "Hz", 3) }} ·
            {{ activeMarker.amplitude.toFixed(1) }}
            {{ activeMarker.unit }}
          </template>
          <template v-else>—</template>
        </dd>
      </div>
    </dl>

    <p v-if="traceError" class="text-xs text-state-error" role="alert">
      {{ traceError }}
    </p>
  </div>
</template>
