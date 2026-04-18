<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import uPlot, { type AlignedData, type Options } from "uplot";
import { Activity, Download } from "lucide-vue-next";
import { api, type WaveformDto } from "@/api/client";
import { usePolling } from "@/composables/usePolling";
import { useThemeStore } from "@/stores/theme";
import { formatSi, formatTime } from "@/lib/format";
import type {
  OscilloscopeChannelState,
  TimebaseState,
} from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const theme = useThemeStore();

const channels = usePolling<OscilloscopeChannelState[]>(
  () => api.getScopeChannels(props.sessionId),
  { intervalMs: 3000, enabled: computed(() => props.enabled) },
);
const timebase = usePolling<TimebaseState>(
  () => api.getScopeTimebase(props.sessionId),
  { intervalMs: 3000, enabled: computed(() => props.enabled) },
);

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
  await channels.refresh();
}

async function applyTimebase(event: Event): Promise<void> {
  const form = event.target as HTMLFormElement;
  const scale = Number((form.elements.namedItem("scale") as HTMLInputElement).value);
  const position = Number(
    (form.elements.namedItem("position") as HTMLInputElement).value,
  );
  event.preventDefault();
  await api.setScopeTimebase(props.sessionId, { scale, position });
  await timebase.refresh();
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
</script>

<template>
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
</template>
