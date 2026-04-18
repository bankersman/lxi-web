<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import uPlot, { type AlignedData, type Options } from "uplot";
import { Activity, Download } from "lucide-vue-next";
import {
  api,
  type PresetsInfo,
  type ScopeAcquisitionInfo,
  type ScopeBusesInfo,
  type ScopeCursorsInfo,
  type ScopeDisplayInfo,
  type ScopeHistoryInfo,
  type ScopeMathInfo,
  type ScopeMeasurementsInfo,
  type ScopeReferencesInfo,
  type ScopeTriggerInfo,
  type WaveformDto,
} from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { usePolling } from "@/composables/usePolling";
import { useThemeStore } from "@/stores/theme";
import { formatSi, formatTime } from "@/lib/format";
import type {
  OscilloscopeAcquisitionConfig,
  OscilloscopeChannelState,
  OscilloscopeCursorConfig,
  OscilloscopeDisplayPersistence,
  OscilloscopeMathConfig,
  OscilloscopeScreenshotFormat,
  OscilloscopeSweep,
  OscilloscopeTriggerConfig,
  TimebaseState,
} from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const theme = useThemeStore();

const channels = useLiveReading<OscilloscopeChannelState[]>(
  () => props.sessionId,
  "scope.channels",
  { enabled: computed(() => props.enabled) },
);
const timebase = useLiveReading<TimebaseState>(
  () => props.sessionId,
  "scope.timebase",
  { enabled: computed(() => props.enabled) },
);

/**
 * One-shot HTTP fetches wired to user actions (toggle channel, change
 * timebase). The WS feed covers the steady-state refresh; these just
 * give immediate feedback after an explicit write instead of waiting for
 * the next scheduler tick.
 */
async function refreshChannels(): Promise<void> {
  try {
    channels.data.value = await api.getScopeChannels(props.sessionId);
  } catch {
    /* live feed will surface the next error */
  }
}
async function refreshTimebase(): Promise<void> {
  try {
    timebase.data.value = await api.getScopeTimebase(props.sessionId);
  } catch {
    /* live feed will surface the next error */
  }
}

const waveform = ref<WaveformDto | null>(null);
const waveformChannel = ref(1);
const capturing = ref(false);
const capturedAt = ref<number | null>(null);
const captureError = ref<string | null>(null);

const chartEl = ref<HTMLDivElement | null>(null);
const chart = shallowRef<uPlot | null>(null);

const chartColors = computed(() =>
  theme.mode === "dark"
    ? {
        grid: "rgba(148, 163, 184, 0.18)",
        axis: "#9aa0b0",
        stroke: "#60a5fa",
        fill: "rgba(96, 165, 250, 0.12)",
      }
    : {
        grid: "rgba(71, 85, 105, 0.18)",
        axis: "#5c6273",
        stroke: "#2563eb",
        fill: "rgba(37, 99, 235, 0.12)",
      },
);

function buildOptions(width: number): Options {
  const c = chartColors.value;
  return {
    width,
    height: 320,
    scales: { x: { time: false } },
    axes: [
      {
        stroke: c.axis,
        grid: { stroke: c.grid },
        values: (_u, ticks) => ticks.map((t) => formatSi(t, "s", 3)),
      },
      {
        stroke: c.axis,
        grid: { stroke: c.grid },
        values: (_u, ticks) => ticks.map((t) => formatSi(t, "V", 3)),
      },
    ],
    series: [
      { label: "Time" },
      {
        label: `CH${waveformChannel.value}`,
        stroke: c.stroke,
        fill: c.fill,
        width: 1.5,
      },
    ],
    cursor: { drag: { x: true, y: false } },
    legend: { show: false },
  };
}

function draw(): void {
  if (!chartEl.value) return;
  const w = chartEl.value.clientWidth || 720;
  const data: AlignedData = waveform.value
    ? [waveform.value.x as number[], waveform.value.y as number[]]
    : [[0, 1], [0, 0]];
  if (chart.value) chart.value.destroy();
  chart.value = new uPlot(buildOptions(w), data, chartEl.value);
}

watch([waveform, chartColors], () => draw());

const resizeObserver =
  typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => draw())
    : null;

watch(chartEl, (el, _old, onCleanup) => {
  if (!el) return;
  draw();
  resizeObserver?.observe(el);
  onCleanup(() => resizeObserver?.unobserve(el));
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart.value?.destroy();
});

async function capture(): Promise<void> {
  if (capturing.value) return;
  capturing.value = true;
  captureError.value = null;
  try {
    await api.singleCapture(props.sessionId);
    const wave = await api.readWaveform(props.sessionId, waveformChannel.value);
    waveform.value = wave;
    capturedAt.value = wave.capturedAt;
  } catch (err) {
    captureError.value = err instanceof Error ? err.message : String(err);
  } finally {
    capturing.value = false;
  }
}

async function toggleChannel(channel: OscilloscopeChannelState): Promise<void> {
  await api.setScopeChannelEnabled(props.sessionId, channel.id, !channel.enabled);
  await refreshChannels();
}

async function applyTimebase(event: Event): Promise<void> {
  const form = event.target as HTMLFormElement;
  const scale = Number((form.elements.namedItem("scale") as HTMLInputElement).value);
  const position = Number(
    (form.elements.namedItem("position") as HTMLInputElement).value,
  );
  event.preventDefault();
  await api.setScopeTimebase(props.sessionId, { scale, position });
  await refreshTimebase();
}

function exportCsv(): void {
  if (!waveform.value) return;
  const header = "time_s,voltage_v\n";
  const rows = waveform.value.x
    .map((t, i) => `${t},${waveform.value!.y[i]}`)
    .join("\n");
  const blob = new Blob([header, rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `waveform-ch${waveform.value.channel}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const tableSamples = computed(() => {
  const w = waveform.value;
  if (!w) return [] as { t: number; v: number }[];
  const step = Math.max(1, Math.floor(w.x.length / 20));
  const rows: { t: number; v: number }[] = [];
  for (let i = 0; i < w.x.length; i += step) {
    rows.push({ t: w.x[i], v: w.y[i] });
  }
  return rows;
});

// ---- Advanced capabilities (2.7a–d) ----

const trigger = ref<ScopeTriggerInfo | null>(null);
const acquisition = ref<ScopeAcquisitionInfo | null>(null);
const measurements = ref<ScopeMeasurementsInfo | null>(null);
const cursors = ref<ScopeCursorsInfo | null>(null);
const scopeMath = ref<ScopeMathInfo | null>(null);
const references = ref<ScopeReferencesInfo | null>(null);
const history = ref<ScopeHistoryInfo | null>(null);
const display = ref<ScopeDisplayInfo | null>(null);
const presets = ref<PresetsInfo | null>(null);
const buses = ref<ScopeBusesInfo | null>(null);
const advError = ref<string | null>(null);

async function loadAdvanced(): Promise<void> {
  const results = await Promise.allSettled([
    api.getScopeTrigger(props.sessionId),
    api.getScopeAcquisition(props.sessionId),
    api.getScopeMeasurements(props.sessionId),
    api.getScopeCursors(props.sessionId),
    api.getScopeMath(props.sessionId),
    api.getScopeReferences(props.sessionId),
    api.getScopeHistory(props.sessionId),
    api.getScopeDisplay(props.sessionId),
    api.getScopePresets(props.sessionId),
    api.getScopeBuses(props.sessionId),
  ]);
  trigger.value = results[0].status === "fulfilled" ? results[0].value : null;
  acquisition.value = results[1].status === "fulfilled" ? results[1].value : null;
  measurements.value = results[2].status === "fulfilled" ? results[2].value : null;
  cursors.value = results[3].status === "fulfilled" ? results[3].value : null;
  scopeMath.value = results[4].status === "fulfilled" ? results[4].value : null;
  references.value = results[5].status === "fulfilled" ? results[5].value : null;
  history.value = results[6].status === "fulfilled" ? results[6].value : null;
  display.value = results[7].status === "fulfilled" ? results[7].value : null;
  presets.value = results[8].status === "fulfilled" ? results[8].value : null;
  buses.value = results[9].status === "fulfilled" ? results[9].value : null;
}

void loadAdvanced();

function wrap<T>(fn: () => Promise<T>): Promise<T | null> {
  advError.value = null;
  return fn().catch((err) => {
    advError.value = String(err);
    return null;
  });
}

// 2.7a trigger
const triggerDraft = ref<OscilloscopeTriggerConfig>({
  type: "edge",
  source: "CH1",
  slope: "rising",
  level: 0,
});

watch(trigger, (t) => {
  if (t?.config) triggerDraft.value = { ...t.config } as OscilloscopeTriggerConfig;
});

async function applyTrigger(): Promise<void> {
  await wrap(() => api.setScopeTrigger(props.sessionId, triggerDraft.value));
  await loadAdvanced();
}

async function setSweep(mode: OscilloscopeSweep): Promise<void> {
  await wrap(() => api.setScopeSweep(props.sessionId, mode));
  await loadAdvanced();
}

async function forceTrigger(): Promise<void> {
  await wrap(() => api.forceScopeTrigger(props.sessionId));
}

// 2.7a acquisition
const acqDraft = ref<OscilloscopeAcquisitionConfig>({
  mode: "normal",
  averages: 16,
  memoryDepth: "auto",
});
watch(acquisition, (a) => {
  if (a?.config) acqDraft.value = { ...a.config };
});

async function applyAcquisition(): Promise<void> {
  await wrap(() => api.setScopeAcquisition(props.sessionId, acqDraft.value));
  await loadAdvanced();
}

async function autoset(): Promise<void> {
  await wrap(() => api.scopeAutoset(props.sessionId));
}

async function runScope(): Promise<void> {
  await wrap(() => api.scopeRun(props.sessionId));
}
async function stopScope(): Promise<void> {
  await wrap(() => api.scopeStop(props.sessionId));
}

// 2.7b measurements
const measurementDrafts = ref<{ id: string; source: string }[]>([]);
async function applyMeasurements(): Promise<void> {
  await wrap(() => api.setScopeMeasurements(props.sessionId, measurementDrafts.value));
  measurements.value = await api.getScopeMeasurements(props.sessionId);
}
function addMeasurement(): void {
  const first = measurements.value?.capability?.items[0];
  const src = measurements.value?.capability?.sources[0];
  if (!first || !src) return;
  if (
    measurementDrafts.value.length >=
    (measurements.value?.capability?.maxSelections ?? 10)
  ) {
    return;
  }
  measurementDrafts.value.push({ id: first.id, source: src });
}
function removeMeasurement(i: number): void {
  measurementDrafts.value.splice(i, 1);
}
async function clearStats(): Promise<void> {
  await wrap(() => api.clearScopeMeasurementStats(props.sessionId));
}

const measurementsPoll = usePolling(
  () => api.getScopeMeasurements(props.sessionId),
  {
    intervalMs: 1500,
    enabled: computed(
      () => props.enabled && measurementDrafts.value.length > 0,
    ),
  },
);
watch(measurementsPoll.data, (m) => {
  if (m) measurements.value = m;
});

// 2.7b cursors
const cursorDraft = ref<OscilloscopeCursorConfig>({ mode: "off", axis: "x" });
watch(cursors, (c) => {
  if (c?.state?.config) cursorDraft.value = { ...c.state.config };
});
async function applyCursors(): Promise<void> {
  await wrap(() => api.setScopeCursors(props.sessionId, cursorDraft.value));
  cursors.value = await api.getScopeCursors(props.sessionId);
}

// 2.7b math
const scopeMathDraft = ref<OscilloscopeMathConfig>({
  enabled: false,
  operator: "add",
  source1: "CH1",
  source2: "CH2",
});
watch(scopeMath, (m) => {
  if (m?.config) scopeMathDraft.value = { ...m.config };
});
async function applyScopeMath(): Promise<void> {
  await wrap(() => api.setScopeMath(props.sessionId, scopeMathDraft.value));
  scopeMath.value = await api.getScopeMath(props.sessionId);
}

// 2.7c references
async function saveReference(slot: number, source: string): Promise<void> {
  await wrap(() => api.saveScopeReference(props.sessionId, slot, source));
  references.value = await api.getScopeReferences(props.sessionId);
}
async function toggleReference(slot: number, enabled: boolean): Promise<void> {
  await wrap(() => api.setScopeReferenceEnabled(props.sessionId, slot, enabled));
  references.value = await api.getScopeReferences(props.sessionId);
}

// 2.7c history
async function setHistoryEnabled(enabled: boolean): Promise<void> {
  await wrap(() => api.setScopeHistory(props.sessionId, { enabled }));
  history.value = await api.getScopeHistory(props.sessionId);
}
async function setHistoryFrame(frame: number): Promise<void> {
  await wrap(() => api.setScopeHistory(props.sessionId, { frame }));
}
async function setHistoryPlayback(playing: boolean): Promise<void> {
  await wrap(() => api.setScopeHistory(props.sessionId, { playing }));
  history.value = await api.getScopeHistory(props.sessionId);
}

// 2.7c display
async function setPersistence(event: Event): Promise<void> {
  const p = (event.target as HTMLSelectElement).value as OscilloscopeDisplayPersistence;
  await wrap(() => api.setScopeDisplay(props.sessionId, { persistence: p }));
  display.value = await api.getScopeDisplay(props.sessionId);
}

function screenshotUrl(format: OscilloscopeScreenshotFormat): string {
  return api.scopeScreenshotUrl(props.sessionId, format);
}

// 2.7c presets
async function saveScopePreset(slot: number): Promise<void> {
  await wrap(() => api.saveScopePreset(props.sessionId, slot));
  presets.value = await api.getScopePresets(props.sessionId);
}
async function recallScopePreset(slot: number): Promise<void> {
  await wrap(() => api.recallScopePreset(props.sessionId, slot));
  await loadAdvanced();
}

// 2.7d decoders (compact view — more elaborate UI is future work)
const busDrafts = ref<Record<number, string>>({});
async function disableBus(busId: number): Promise<void> {
  await wrap(() => api.setScopeBus(props.sessionId, busId, null));
  buses.value = await api.getScopeBuses(props.sessionId);
}
</script>

<template>
  <div class="flex flex-col gap-4">
  <div class="grid gap-4 lg:grid-cols-[1fr_280px]">
    <div class="flex flex-col gap-3">
      <div class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">Waveform</h3>
          <div class="flex items-center gap-2 text-xs text-fg-muted">
            <span v-if="capturedAt" aria-live="polite">
              Captured {{ formatTime(capturedAt) }}
            </span>
          </div>
        </div>
        <div ref="chartEl" class="min-h-[320px] w-full" role="img" aria-label="Oscilloscope waveform" />
        <p v-if="captureError" class="mt-2 text-xs text-state-error" role="alert">
          {{ captureError }}
        </p>
      </div>

      <details v-if="waveform" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <summary class="cursor-pointer text-sm font-semibold">Data table (sampled)</summary>
        <table class="mt-3 w-full text-left text-xs">
          <thead class="text-fg-muted">
            <tr>
              <th scope="col" class="py-1 pr-4 font-medium">Time</th>
              <th scope="col" class="py-1 font-medium">Voltage</th>
            </tr>
          </thead>
          <tbody class="font-mono">
            <tr v-for="(row, i) in tableSamples" :key="i" class="border-t border-border">
              <td class="py-1 pr-4">{{ formatSi(row.t, "s", 3) }}</td>
              <td class="py-1">{{ formatSi(row.v, "V", 3) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>

    <aside class="flex flex-col gap-4">
      <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <h3 class="mb-2 text-sm font-semibold">Acquisition</h3>
        <div class="flex items-center gap-2">
          <label class="text-xs text-fg-muted" for="scope-channel">Source</label>
          <select
            id="scope-channel"
            v-model.number="waveformChannel"
            class="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option
              v-for="ch in channels.data.value ?? []"
              :key="ch.id"
              :value="ch.id"
            >
              {{ ch.label }}
            </option>
          </select>
        </div>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="capturing || !enabled"
            @click="capture"
          >
            <Activity class="h-3.5 w-3.5" aria-hidden="true" />
            {{ capturing ? "Capturing…" : "Single capture" }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!waveform"
            @click="exportCsv"
          >
            <Download class="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </button>
        </div>
      </section>

      <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <h3 class="mb-2 text-sm font-semibold">Channels</h3>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="ch in channels.data.value ?? []"
            :key="ch.id"
            class="flex items-center justify-between gap-2 rounded-md bg-surface-3 px-2 py-1.5 text-xs"
          >
            <div>
              <p class="font-medium">{{ ch.label }}</p>
              <p class="text-fg-muted">{{ formatSi(ch.scale, "V/div", 3) }}</p>
            </div>
            <button
              type="button"
              class="rounded-md px-2 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              :class="
                ch.enabled
                  ? 'bg-state-connected/15 text-state-connected hover:bg-state-connected/25'
                  : 'bg-surface-2 text-fg-muted hover:bg-surface'
              "
              :aria-pressed="ch.enabled"
              @click="toggleChannel(ch)"
            >
              {{ ch.enabled ? "ON" : "OFF" }}
            </button>
          </li>
        </ul>
      </section>

      <section
        v-if="timebase.data.value"
        class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
      >
        <h3 class="mb-2 text-sm font-semibold">Timebase</h3>
        <form class="flex flex-col gap-2 text-xs" @submit="applyTimebase">
          <label class="flex items-center justify-between gap-2">
            <span class="text-fg-muted">Scale (s/div)</span>
            <input
              name="scale"
              type="number"
              step="any"
              :value="timebase.data.value.scale"
              class="h-8 w-32 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label class="flex items-center justify-between gap-2">
            <span class="text-fg-muted">Position (s)</span>
            <input
              name="position"
              type="number"
              step="any"
              :value="timebase.data.value.position"
              class="h-8 w-32 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <button
            type="submit"
            class="mt-1 inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Apply
          </button>
        </form>
      </section>
    </aside>
  </div>

  <p v-if="advError" class="text-xs text-state-error" role="alert">{{ advError }}</p>

  <!-- 2.7a trigger -->
  <details v-if="trigger?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Trigger</summary>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <label class="flex flex-col text-xs text-fg-muted">
        Type
        <select
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          :value="triggerDraft.type"
          @change="(e) => (triggerDraft = { type: (e.target as HTMLSelectElement).value as OscilloscopeTriggerConfig['type'], source: 'CH1', slope: 'rising', level: 0 } as OscilloscopeTriggerConfig)"
        >
          <option v-for="t in trigger.capability?.types ?? []" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        Source
        <select
          v-model="triggerDraft.source"
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option v-for="s in trigger.capability?.sources ?? []" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label v-if="'level' in triggerDraft" class="flex flex-col text-xs text-fg-muted">
        Level (V)
        <input
          v-model.number="(triggerDraft as any).level"
          type="number"
          step="any"
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
      </label>
      <label v-if="'slope' in triggerDraft" class="flex flex-col text-xs text-fg-muted">
        Slope
        <select
          v-model="(triggerDraft as any).slope"
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="rising">rising</option>
          <option value="falling">falling</option>
          <option value="either">either</option>
        </select>
      </label>
    </div>
    <div class="mt-3 flex items-center gap-2">
      <button class="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg" @click="applyTrigger">Apply</button>
      <span class="text-xs text-fg-muted">Sweep:</span>
      <button
        v-for="m in trigger.capability?.sweepModes ?? []"
        :key="m"
        class="rounded-md border border-border px-2 py-1 text-xs"
        :class="trigger.sweep === m ? 'bg-accent text-accent-fg' : ''"
        @click="setSweep(m)"
      >{{ m }}</button>
      <button
        v-if="trigger.capability?.supportsForce"
        class="ml-auto rounded-md border border-border px-3 py-1.5 text-sm"
        @click="forceTrigger"
      >Force</button>
    </div>
  </details>

  <!-- 2.7a acquisition -->
  <details v-if="acquisition?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Acquisition</summary>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <label class="flex flex-col text-xs text-fg-muted">
        Mode
        <select v-model="acqDraft.mode" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option v-for="m in acquisition.capability?.modes ?? []" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>
      <label v-if="acqDraft.mode === 'average'" class="flex flex-col text-xs text-fg-muted">
        Averages
        <input
          v-model.number="acqDraft.averages"
          type="number"
          :min="acquisition.capability?.averagesRange.min"
          :max="acquisition.capability?.averagesRange.max"
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        Memory depth
        <select v-model="acqDraft.memoryDepth" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option v-for="d in acquisition.capability?.memoryDepths ?? []" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <div class="flex items-end gap-2">
        <button class="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg" @click="applyAcquisition">Apply</button>
        <button
          v-if="acquisition.capability?.supportsAutoset"
          class="rounded-md border border-border px-3 py-1.5 text-sm"
          @click="autoset"
        >Autoset</button>
      </div>
    </div>
    <div class="mt-3 flex gap-2">
      <button class="rounded-md border border-border px-3 py-1.5 text-sm" @click="runScope">Run</button>
      <button class="rounded-md border border-border px-3 py-1.5 text-sm" @click="stopScope">Stop</button>
    </div>
  </details>

  <!-- 2.7b measurements -->
  <details v-if="measurements?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">
      Measurements ({{ measurementDrafts.length }}/{{ measurements.capability?.maxSelections ?? 10 }})
    </summary>
    <div class="mt-3 flex flex-col gap-2">
      <div
        v-for="(sel, i) in measurementDrafts"
        :key="i"
        class="flex items-center gap-2"
      >
        <select v-model="sel.id" class="h-8 rounded-md border border-border bg-surface px-2 text-xs">
          <option v-for="it in measurements.capability?.items ?? []" :key="it.id" :value="it.id">{{ it.label }}</option>
        </select>
        <select v-model="sel.source" class="h-8 rounded-md border border-border bg-surface px-2 text-xs">
          <option v-for="s in measurements.capability?.sources ?? []" :key="s" :value="s">{{ s }}</option>
        </select>
        <span v-if="measurements.results?.[i]" class="ml-auto font-mono text-xs">
          {{ formatSi(measurements.results[i].value, measurements.results[i].unit, 4) }}
        </span>
        <button class="rounded-md border border-border px-2 py-0.5 text-xs" @click="removeMeasurement(i)">×</button>
      </div>
      <div class="flex gap-2">
        <button class="rounded-md border border-border px-2 py-1 text-xs" @click="addMeasurement">+ Add</button>
        <button class="rounded-md bg-accent px-3 py-1 text-xs text-accent-fg" @click="applyMeasurements">Apply</button>
        <button class="rounded-md border border-border px-2 py-1 text-xs" @click="clearStats">Clear stats</button>
      </div>
    </div>
  </details>

  <!-- 2.7b cursors -->
  <details v-if="cursors?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Cursors</summary>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <label class="flex flex-col text-xs text-fg-muted">
        Mode
        <select v-model="cursorDraft.mode" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option v-for="m in cursors.capability?.modes ?? []" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        Axis
        <select v-model="cursorDraft.axis" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="xy">XY</option>
        </select>
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        A
        <input
          v-model.number="cursorDraft.aX"
          type="number"
          step="any"
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        B
        <input
          v-model.number="cursorDraft.bX"
          type="number"
          step="any"
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
      </label>
    </div>
    <div v-if="cursors.state?.readout" class="mt-2 flex gap-3 font-mono text-xs">
      <span v-if="cursors.state.readout.deltaX">Δ = {{ formatSi(cursors.state.readout.deltaX, "s", 4) }}</span>
      <span v-if="cursors.state.readout.inverseDeltaX">1/Δ = {{ formatSi(cursors.state.readout.inverseDeltaX, "Hz", 4) }}</span>
    </div>
    <button class="mt-2 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg" @click="applyCursors">Apply</button>
  </details>

  <!-- 2.7b math -->
  <details v-if="scopeMath?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Math</summary>
    <div class="mt-3 grid gap-3 md:grid-cols-4">
      <label class="flex flex-col text-xs text-fg-muted">
        Enabled
        <input v-model="scopeMathDraft.enabled" type="checkbox" class="mt-1" />
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        Operator
        <select v-model="scopeMathDraft.operator" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option v-for="o in scopeMath.capability?.operators ?? []" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        Source 1
        <select v-model="scopeMathDraft.source1" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option v-for="s in scopeMath.capability?.sources ?? []" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label class="flex flex-col text-xs text-fg-muted">
        Source 2
        <select v-model="scopeMathDraft.source2" class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm">
          <option value="">(n/a)</option>
          <option v-for="s in scopeMath.capability?.sources ?? []" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>
    <button class="mt-2 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg" @click="applyScopeMath">Apply</button>
  </details>

  <!-- 2.7c references -->
  <details v-if="references?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">References ({{ references.capability?.slots ?? 0 }} slots)</summary>
    <div class="mt-3 grid grid-cols-5 gap-2 md:grid-cols-10">
      <div
        v-for="slot in references.slots ?? []"
        :key="slot.slot"
        class="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-3 p-2"
      >
        <span class="text-xs font-semibold">R{{ slot.slot + 1 }}</span>
        <span class="text-[10px] text-fg-muted">{{ slot.source ?? '—' }}</span>
        <button class="rounded bg-accent px-1 py-0.5 text-[10px] text-accent-fg" @click="saveReference(slot.slot, `CH${waveformChannel}`)">Save</button>
        <button
          class="rounded border border-border px-1 py-0.5 text-[10px]"
          :class="slot.enabled ? 'bg-state-success/20' : ''"
          @click="toggleReference(slot.slot, !slot.enabled)"
        >{{ slot.enabled ? 'Shown' : 'Hidden' }}</button>
      </div>
    </div>
  </details>

  <!-- 2.7c history -->
  <details v-if="history?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">History / segmented memory</summary>
    <div class="mt-3 flex items-center gap-2 text-xs">
      <button
        class="rounded-md border border-border px-2 py-1"
        :class="history.state?.enabled ? 'bg-state-success/20' : ''"
        @click="setHistoryEnabled(!history.state?.enabled)"
      >{{ history.state?.enabled ? 'Enabled' : 'Disabled' }}</button>
      <button class="rounded-md border border-border px-2 py-1" @click="setHistoryPlayback(!history.state?.playing)">
        {{ history.state?.playing ? 'Pause' : 'Play' }}
      </button>
      <input
        type="range"
        :min="0"
        :max="history.state?.totalFrames ?? 0"
        :value="history.state?.currentFrame ?? 0"
        class="flex-1"
        @change="(e) => setHistoryFrame(Number((e.target as HTMLInputElement).value))"
      />
      <span class="font-mono text-xs">{{ history.state?.currentFrame ?? 0 }} / {{ history.state?.totalFrames ?? 0 }}</span>
    </div>
  </details>

  <!-- 2.7c display + screenshot -->
  <details v-if="display?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Display &amp; screenshot</summary>
    <div class="mt-3 flex items-center gap-3">
      <label class="flex flex-col text-xs text-fg-muted">
        Persistence
        <select
          class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          :value="display.persistence ?? 'min'"
          @change="setPersistence"
        >
          <option v-for="p in display.capability?.persistenceOptions ?? []" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
      <a
        v-for="f in display.capability?.screenshotFormats ?? []"
        :key="f"
        :href="screenshotUrl(f)"
        :download="`scope.${f}`"
        class="rounded-md border border-border px-3 py-1.5 text-sm"
      >{{ f.toUpperCase() }}</a>
    </div>
  </details>

  <!-- 2.7c presets -->
  <details v-if="presets?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Presets ({{ presets.slots }} slots)</summary>
    <div class="mt-3 grid grid-cols-5 gap-2 md:grid-cols-10">
      <div
        v-for="(occ, i) in presets.occupied"
        :key="i"
        class="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-3 p-2"
      >
        <span class="text-xs font-semibold">{{ i }}</span>
        <span class="block h-1.5 w-full rounded-full" :class="occ ? 'bg-state-success' : 'bg-border'" />
        <button class="rounded bg-accent px-1 py-0.5 text-[10px] text-accent-fg" @click="saveScopePreset(i)">Save</button>
        <button
          class="rounded border border-border px-1 py-0.5 text-[10px] disabled:opacity-50"
          :disabled="!occ"
          @click="recallScopePreset(i)"
        >Recall</button>
      </div>
    </div>
  </details>

  <!-- 2.7d decoders -->
  <details v-if="buses?.supported" class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
    <summary class="cursor-pointer text-sm font-semibold">Protocol decoders</summary>
    <div class="mt-3 flex flex-col gap-2 text-xs">
      <div
        v-for="bus in buses.buses ?? []"
        :key="bus.id"
        class="flex items-center gap-2 rounded-md border border-border bg-surface-3 p-2"
      >
        <span class="font-mono font-semibold">BUS{{ bus.id }}</span>
        <span class="text-fg-muted">{{ bus.config?.protocol ?? 'off' }}</span>
        <span v-if="bus.enabled" class="rounded-full bg-state-success/20 px-2 py-0.5 text-[10px]">live</span>
        <button
          v-if="bus.enabled"
          class="ml-auto rounded border border-border px-2 py-0.5 text-xs"
          @click="disableBus(bus.id)"
        >Disable</button>
        <span class="ml-auto text-fg-muted">Supported: {{ (buses.capability?.protocols ?? []).join(', ') }}</span>
      </div>
    </div>
  </details>
  </div>
</template>
