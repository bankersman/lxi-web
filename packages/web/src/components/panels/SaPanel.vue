<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api, type SaStateInfo } from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { formatSi } from "@/lib/format";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";
import type { SpectrumAnalyzerMarkerReading } from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const gate = useSafeModeGate();
const controlsLocked = computed(() => !props.enabled || gate.enabled);
const lockTitle = computed(() => (gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined));

const state = ref<SaStateInfo | null>(null);
const initError = ref<string | null>(null);
const actionError = ref<string | null>(null);

interface TracePayload {
  readonly id: number;
  readonly points: number;
  readonly unit: string;
  readonly timestamp: number;
  readonly frequencyHz: readonly number[];
  readonly amplitude: readonly number[];
}

const { data: trace, error: traceError } = useLiveReading<TracePayload>(
  () => props.sessionId,
  "sa.trace",
  { enabled: computed(() => props.enabled) },
);

const { data: markers } = useLiveReading<readonly SpectrumAnalyzerMarkerReading[]>(
  () => props.sessionId,
  "sa.markers",
  { enabled: computed(() => props.enabled) },
);

const centerDraft = ref("");
const spanDraft = ref("");
const refLevelDraft = ref("");
const pointsDraft = ref("");
const rbwDraft = ref("");

onMounted(() => void loadState());

watch(
  () => props.sessionId,
  () => {
    state.value = null;
    void loadState();
  },
);

async function loadState(): Promise<void> {
  if (!props.enabled) return;
  try {
    const info = await api.getSaState(props.sessionId);
    state.value = info;
    centerDraft.value = String(info.frequency.centerHz);
    spanDraft.value = String(info.frequency.spanHz);
    refLevelDraft.value = String(info.referenceLevel.dbm);
    pointsDraft.value = String(info.sweep.pointsN);
    rbwDraft.value = String(info.bandwidth.rbwHz);
    initError.value = null;
  } catch (err) {
    initError.value = err instanceof Error ? err.message : String(err);
  }
}

async function applyFrequency(): Promise<void> {
  try {
    await api.setSaFrequency(props.sessionId, {
      kind: "centerSpan",
      centerHz: Number(centerDraft.value),
      spanHz: Number(spanDraft.value),
    });
    actionError.value = null;
    await loadState();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function applyReferenceLevel(): Promise<void> {
  try {
    await api.setSaReferenceLevel(props.sessionId, Number(refLevelDraft.value));
    actionError.value = null;
    await loadState();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function applySweep(): Promise<void> {
  try {
    await api.setSaSweep(props.sessionId, {
      pointsN: Number(pointsDraft.value),
    });
    actionError.value = null;
    await loadState();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function applyBandwidth(): Promise<void> {
  try {
    await api.setSaBandwidth(props.sessionId, {
      rbwHz: Number(rbwDraft.value),
      autoRbw: false,
    });
    actionError.value = null;
    await loadState();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function triggerSingleSweep(): Promise<void> {
  try {
    await api.singleSaSweep(props.sessionId);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function peakSearch(): Promise<void> {
  try {
    await api.setSaMarker(props.sessionId, 1, { enabled: true, type: "normal" });
    await api.saPeakSearch(props.sessionId, 1);
    actionError.value = null;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

const tracePath = computed(() => {
  const data = trace.value;
  if (!data || data.points < 2) return "";
  let min = Infinity;
  let max = -Infinity;
  for (const a of data.amplitude) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  // Add a dB of headroom so the peak doesn't slam the top edge.
  min -= 1;
  max += 1;
  const range = Math.max(0.01, max - min);
  const step = 800 / (data.points - 1);
  let path = "";
  for (let i = 0; i < data.points; i += 1) {
    const x = i * step;
    const y = 200 - ((data.amplitude[i]! - min) / range) * 200;
    path += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return path.trim();
});

const yAxisLabels = computed(() => {
  const data = trace.value;
  if (!data || data.amplitude.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const a of data.amplitude) {
    if (a < min) min = a;
    if (a > max) max = a;
  }
  return { top: max.toFixed(1), bottom: min.toFixed(1) };
});

const peak = computed(() => {
  const data = trace.value;
  if (!data || data.amplitude.length === 0) return null;
  let peakIdx = 0;
  let peakVal = data.amplitude[0]!;
  for (let i = 1; i < data.amplitude.length; i += 1) {
    if (data.amplitude[i]! > peakVal) {
      peakVal = data.amplitude[i]!;
      peakIdx = i;
    }
  }
  return {
    frequencyHz: data.frequencyHz[peakIdx]!,
    amplitude: peakVal,
  };
});

const activeMarkers = computed(() =>
  (markers.value ?? []).filter((m) => m.enabled),
);
</script>

<template>
  <section class="mt-6 space-y-6">
    <header class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Spectrum analyzer</h2>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-border bg-surface-2 px-3 py-1 text-sm hover:bg-surface-3 disabled:opacity-50"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="peakSearch"
        >
          Peak search
        </button>
        <button
          type="button"
          class="rounded-md border border-border bg-surface-2 px-3 py-1 text-sm hover:bg-surface-3 disabled:opacity-50"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="triggerSingleSweep"
        >
          Single sweep
        </button>
      </div>
    </header>

    <!-- Trace hero ------------------------------------------------------->
    <div
      class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <div class="mb-2 flex items-center justify-between text-xs text-fg-muted">
        <span>
          <template v-if="state">
            Start: {{ formatSi(state.frequency.startHz, "Hz", 3) }} · Stop:
            {{ formatSi(state.frequency.stopHz, "Hz", 3) }}
          </template>
        </span>
        <span v-if="yAxisLabels">
          Y: {{ yAxisLabels.bottom }} … {{ yAxisLabels.top }} dBm
        </span>
      </div>
      <div
        class="relative h-52 w-full overflow-hidden rounded bg-surface-3"
        role="img"
        aria-label="Spectrum analyzer trace"
      >
        <svg
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          class="h-full w-full text-accent"
        >
          <path
            v-if="tracePath"
            :d="tracePath"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </svg>
        <p
          v-if="!trace"
          class="absolute inset-0 flex items-center justify-center text-sm text-fg-muted"
        >
          Waiting for first sweep…
        </p>
      </div>
      <dl class="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div class="flex flex-col">
          <dt class="text-fg-muted">Peak frequency</dt>
          <dd class="font-mono tabular-nums">
            {{ peak ? formatSi(peak.frequencyHz, "Hz", 3) : "—" }}
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-fg-muted">Peak amplitude</dt>
          <dd class="font-mono tabular-nums">
            {{ peak ? `${peak.amplitude.toFixed(2)} dBm` : "—" }}
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-fg-muted">Points</dt>
          <dd class="font-mono tabular-nums">
            {{ trace?.points ?? state?.sweep.pointsN ?? "—" }}
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-fg-muted">RBW</dt>
          <dd class="font-mono tabular-nums">
            {{
              state ? formatSi(state.bandwidth.rbwHz, "Hz", 3) : "—"
            }}
          </dd>
        </div>
      </dl>
      <p v-if="traceError" class="mt-2 text-xs text-state-error" role="alert">
        {{ traceError }}
      </p>
    </div>

    <!-- Setup grid ------------------------------------------------------->
    <div class="grid gap-4 md:grid-cols-2">
      <div
        class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
      >
        <h3 class="text-sm font-semibold">Frequency</h3>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label class="flex flex-col gap-1">
            <span class="text-fg-muted">Center (Hz)</span>
            <input
              v-model="centerDraft"
              type="number"
              class="rounded-md border border-border bg-surface-3 px-2 py-1 font-mono tabular-nums"
              :disabled="controlsLocked"
              :title="lockTitle"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-fg-muted">Span (Hz)</span>
            <input
              v-model="spanDraft"
              type="number"
              class="rounded-md border border-border bg-surface-3 px-2 py-1 font-mono tabular-nums"
              :disabled="controlsLocked"
              :title="lockTitle"
            />
          </label>
        </div>
        <button
          type="button"
          class="mt-3 rounded-md border border-border bg-surface-3 px-3 py-1 text-sm hover:bg-surface disabled:opacity-50"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="applyFrequency"
        >
          Apply frequency
        </button>
      </div>

      <div
        class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
      >
        <h3 class="text-sm font-semibold">Reference &amp; resolution</h3>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label class="flex flex-col gap-1">
            <span class="text-fg-muted">Ref level (dBm)</span>
            <input
              v-model="refLevelDraft"
              type="number"
              class="rounded-md border border-border bg-surface-3 px-2 py-1 font-mono tabular-nums"
              :disabled="controlsLocked"
              :title="lockTitle"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-fg-muted">RBW (Hz)</span>
            <input
              v-model="rbwDraft"
              type="number"
              class="rounded-md border border-border bg-surface-3 px-2 py-1 font-mono tabular-nums"
              :disabled="controlsLocked"
              :title="lockTitle"
            />
          </label>
        </div>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="rounded-md border border-border bg-surface-3 px-3 py-1 text-sm hover:bg-surface disabled:opacity-50"
            :disabled="controlsLocked"
            :title="lockTitle"
            @click="applyReferenceLevel"
          >
            Apply ref level
          </button>
          <button
            type="button"
            class="rounded-md border border-border bg-surface-3 px-3 py-1 text-sm hover:bg-surface disabled:opacity-50"
            :disabled="controlsLocked"
            :title="lockTitle"
            @click="applyBandwidth"
          >
            Apply RBW
          </button>
        </div>
      </div>

      <div
        class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
      >
        <h3 class="text-sm font-semibold">Sweep</h3>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label class="flex flex-col gap-1">
            <span class="text-fg-muted">Points</span>
            <input
              v-model="pointsDraft"
              type="number"
              class="rounded-md border border-border bg-surface-3 px-2 py-1 font-mono tabular-nums"
              :disabled="controlsLocked"
              :title="lockTitle"
            />
          </label>
          <div class="flex flex-col gap-1">
            <span class="text-fg-muted">Continuous</span>
            <span class="font-mono tabular-nums">
              {{
                state ? (state.sweep.continuous ? "yes" : "no") : "—"
              }}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="mt-3 rounded-md border border-border bg-surface-3 px-3 py-1 text-sm hover:bg-surface disabled:opacity-50"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="applySweep"
        >
          Apply sweep
        </button>
      </div>

      <div
        class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
      >
        <h3 class="text-sm font-semibold">Markers</h3>
        <ul v-if="activeMarkers.length" class="mt-2 space-y-1 text-sm">
          <li
            v-for="m in activeMarkers"
            :key="m.id"
            class="flex items-center justify-between rounded bg-surface-3 px-2 py-1 font-mono tabular-nums"
          >
            <span>M{{ m.id }} ({{ m.type }})</span>
            <span>
              {{ formatSi(m.frequencyHz, "Hz", 3) }} ·
              {{ m.amplitude.toFixed(1) }} {{ m.unit }}
            </span>
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-fg-muted">
          No markers enabled. Click "Peak search" to drop M1 on the current peak.
        </p>
      </div>
    </div>

    <p v-if="initError" class="text-xs text-state-error" role="alert">
      {{ initError }}
    </p>
    <p v-if="actionError" class="text-xs text-state-error" role="alert">
      {{ actionError }}
    </p>
  </section>
</template>
