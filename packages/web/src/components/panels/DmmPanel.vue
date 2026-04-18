<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "@/api/client";
import type {
  DmmDualInfo,
  DmmLoggingInfo,
  DmmMathInfo,
  DmmRangingInfo,
  DmmTemperatureInfo,
  DmmTriggerInfo,
  PresetsInfo,
} from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { usePolling } from "@/composables/usePolling";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";
import { formatSi, formatTime } from "@/lib/format";
import { multimeterModeLabel } from "@/lib/labels";
import type {
  MultimeterAutoZero,
  MultimeterDualReading,
  MultimeterMathFunction,
  MultimeterMode,
  MultimeterReading,
  MultimeterTriggerConfig,
  MultimeterTriggerSlope,
  MultimeterTriggerSource,
  TemperatureTransducer,
  TemperatureUnit,
} from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const gate = useSafeModeGate();
const controlsLocked = computed(() => !props.enabled || gate.enabled);
const lockTitle = computed(() => (gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined));

const supported = ref<readonly MultimeterMode[]>([]);
const selectedMode = ref<MultimeterMode | null>(null);
const history = ref<MultimeterReading[]>([]);

const ranging = ref<DmmRangingInfo | null>(null);
const trigger = ref<DmmTriggerInfo | null>(null);
const math = ref<DmmMathInfo | null>(null);
const dual = ref<DmmDualInfo | null>(null);
const dualReading = ref<MultimeterDualReading | null>(null);
const logging = ref<DmmLoggingInfo | null>(null);
const temperature = ref<DmmTemperatureInfo | null>(null);
const presets = ref<PresetsInfo | null>(null);
const actionError = ref<string | null>(null);

async function loadCapabilities(): Promise<void> {
  const results = await Promise.allSettled([
    api.getDmmMode(props.sessionId),
    api.getDmmRanging(props.sessionId),
    api.getDmmTrigger(props.sessionId),
    api.getDmmMath(props.sessionId),
    api.getDmmDualDisplay(props.sessionId),
    api.getDmmLogging(props.sessionId),
    api.getDmmTemperature(props.sessionId),
    api.getDmmPresets(props.sessionId),
  ]);
  if (results[0].status === "fulfilled") {
    supported.value = results[0].value.supported;
    selectedMode.value = results[0].value.mode;
  }
  ranging.value = results[1].status === "fulfilled" ? results[1].value : null;
  trigger.value = results[2].status === "fulfilled" ? results[2].value : null;
  math.value = results[3].status === "fulfilled" ? results[3].value : null;
  dual.value = results[4].status === "fulfilled" ? results[4].value : null;
  logging.value = results[5].status === "fulfilled" ? results[5].value : null;
  temperature.value = results[6].status === "fulfilled" ? results[6].value : null;
  presets.value = results[7].status === "fulfilled" ? results[7].value : null;
}

void loadCapabilities();

const reading = useLiveReading<MultimeterReading>(
  () => props.sessionId,
  "dmm.reading",
  { enabled: computed(() => props.enabled) },
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
  await loadCapabilities();
}

const primary = computed(() => {
  const r = reading.data.value;
  if (!r) return { value: "—", unit: "" };
  if (r.overload) return { value: "OVLD", unit: r.unit };
  return { value: formatSi(r.value, r.unit, 5), unit: "" };
});

// ---- 2.6a ranging + trigger handlers ----

async function applyRange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value;
  if (!selectedMode.value) return;
  actionError.value = null;
  try {
    if (value === "auto") {
      await api.setDmmRanging(props.sessionId, {
        mode: selectedMode.value,
        range: "auto",
      });
    } else {
      await api.setDmmRanging(props.sessionId, {
        mode: selectedMode.value,
        range: Number.parseFloat(value),
      });
    }
    ranging.value = await api.getDmmRanging(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function applyNplc(event: Event): Promise<void> {
  const value = Number.parseFloat((event.target as HTMLSelectElement).value);
  actionError.value = null;
  try {
    await api.setDmmRanging(props.sessionId, { nplc: value });
    ranging.value = await api.getDmmRanging(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function applyAutoZero(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as MultimeterAutoZero;
  actionError.value = null;
  try {
    await api.setDmmRanging(props.sessionId, { autoZero: value });
  } catch (err) {
    actionError.value = String(err);
  }
}

const triggerDraft = ref<Partial<MultimeterTriggerConfig>>({});

watch(trigger, (t) => {
  if (t?.config) triggerDraft.value = { ...t.config };
});

async function applyTrigger(): Promise<void> {
  actionError.value = null;
  try {
    await api.setDmmTrigger(props.sessionId, triggerDraft.value);
    trigger.value = await api.getDmmTrigger(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function fireTrigger(): Promise<void> {
  actionError.value = null;
  try {
    await api.fireDmmTrigger(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

// ---- 2.6b math + dual display ----

const mathFn = ref<MultimeterMathFunction>("none");
const mathNull = ref<string>("");
const mathDbm = ref<string>("600");
const mathLimitUpper = ref<string>("");
const mathLimitLower = ref<string>("");

watch(math, (m) => {
  if (m?.state?.config) {
    mathFn.value = m.state.config.function;
    mathNull.value = m.state.config.nullOffset?.toString() ?? "";
    mathDbm.value = m.state.config.dbmReference?.toString() ?? "600";
    mathLimitUpper.value = m.state.config.limitUpper?.toString() ?? "";
    mathLimitLower.value = m.state.config.limitLower?.toString() ?? "";
  }
});

async function applyMath(): Promise<void> {
  actionError.value = null;
  try {
    await api.setDmmMath(props.sessionId, {
      function: mathFn.value,
      nullOffset: mathNull.value === "" ? undefined : Number.parseFloat(mathNull.value),
      dbmReference: mathFn.value === "dbm" ? Number.parseFloat(mathDbm.value) : undefined,
      limitUpper:
        mathLimitUpper.value === "" ? undefined : Number.parseFloat(mathLimitUpper.value),
      limitLower:
        mathLimitLower.value === "" ? undefined : Number.parseFloat(mathLimitLower.value),
    });
    math.value = await api.getDmmMath(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function resetStats(): Promise<void> {
  actionError.value = null;
  try {
    await api.resetDmmMathStats(props.sessionId);
    math.value = await api.getDmmMath(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function applyDual(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value;
  actionError.value = null;
  try {
    await api.setDmmDualDisplay(
      props.sessionId,
      value === "" ? null : (value as MultimeterMode),
    );
    dual.value = await api.getDmmDualDisplay(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

const dualPoll = useLiveReading<MultimeterDualReading>(
  () => props.sessionId,
  "dmm.dualReading",
  {
    enabled: computed(() => props.enabled && Boolean(dual.value?.secondary)),
  },
);
watch(dualPoll.data, (d) => {
  if (d) dualReading.value = d;
});

// ---- 2.6c logging / temperature / presets ----

const loggingInterval = ref<string>("500");
const loggingTotal = ref<string>("");
const loggingSamples = ref<MultimeterReading[]>([]);

async function startLogging(): Promise<void> {
  actionError.value = null;
  try {
    await api.startDmmLogging(props.sessionId, {
      intervalMs: Number.parseFloat(loggingInterval.value),
      totalSamples: loggingTotal.value === "" ? undefined : Number.parseInt(loggingTotal.value, 10),
    });
    loggingSamples.value = [];
    logging.value = await api.getDmmLogging(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function stopLogging(): Promise<void> {
  actionError.value = null;
  try {
    await api.stopDmmLogging(props.sessionId);
    logging.value = await api.getDmmLogging(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

const loggingPoll = usePolling(
  async () => {
    const { samples } = await api.getDmmLoggingSamples(
      props.sessionId,
      loggingSamples.value[loggingSamples.value.length - 1]?.measuredAt,
    );
    return samples;
  },
  {
    intervalMs: 1000,
    enabled: computed(() => Boolean(logging.value?.status?.running)),
  },
);
watch(loggingPoll.data, (s) => {
  if (!s) return;
  for (const sample of s) {
    loggingSamples.value.push({
      value: sample.value,
      unit: sample.unit,
      mode: sample.mode,
      measuredAt: sample.timestamp,
    });
  }
  loggingSamples.value = loggingSamples.value.slice(-500);
});

const tempUnit = ref<TemperatureUnit>("celsius");
const tempTransducer = ref<TemperatureTransducer>("pt100");

watch(temperature, (t) => {
  if (t?.config) {
    tempUnit.value = t.config.unit;
    tempTransducer.value = t.config.transducer;
  }
});

async function applyTemperature(): Promise<void> {
  actionError.value = null;
  try {
    await api.setDmmTemperature(props.sessionId, {
      unit: tempUnit.value,
      transducer: tempTransducer.value,
    });
    temperature.value = await api.getDmmTemperature(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function savePreset(slot: number): Promise<void> {
  actionError.value = null;
  try {
    await api.saveDmmPreset(props.sessionId, slot);
    presets.value = await api.getDmmPresets(props.sessionId);
  } catch (err) {
    actionError.value = String(err);
  }
}

async function recallPreset(slot: number): Promise<void> {
  actionError.value = null;
  try {
    await api.recallDmmPreset(props.sessionId, slot);
    await loadCapabilities();
  } catch (err) {
    actionError.value = String(err);
  }
}

const availableRanges = computed(() => {
  const mode = selectedMode.value;
  if (!mode || !ranging.value?.capability) return [];
  return ranging.value.capability.ranges[mode] ?? [];
});

const limitStatus = computed(() => math.value?.state?.limitResult);
</script>

<template>
  <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
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
      <p class="text-center font-mono text-5xl font-semibold tabular-nums" aria-live="polite">
        {{ primary.value }}
      </p>
      <p v-if="reading.data.value" class="mt-1 text-center text-xs text-fg-muted">
        Measured {{ formatTime(reading.data.value.measuredAt) }}
      </p>
      <p v-if="limitStatus" class="mt-2 text-center">
        <span
          class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase"
          :class="{
            'bg-state-success/20 text-state-success': limitStatus === 'pass',
            'bg-state-error/20 text-state-error': limitStatus !== 'pass',
          }"
        >{{ limitStatus }}</span>
      </p>
      <p v-if="dual?.secondary && dualReading" class="mt-3 text-center font-mono text-lg tabular-nums text-fg-muted">
        {{ formatSi(dualReading.secondary.value, dualReading.secondary.unit, 4) }}
      </p>
      <p v-if="reading.error.value" class="mt-3 text-xs text-state-error" role="alert">
        {{ reading.error.value }}
      </p>
      <p v-if="actionError" class="mt-3 text-xs text-state-error" role="alert">{{ actionError }}</p>
    </section>

    <aside class="flex flex-col gap-4">
      <section class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4">
        <label for="dmm-mode" class="text-xs text-fg-muted">Measurement mode</label>
        <select
          id="dmm-mode"
          :value="selectedMode ?? ''"
          class="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          :disabled="controlsLocked"
          :title="lockTitle"
          @change="changeMode"
        >
          <option v-for="m in supported" :key="m" :value="m">{{ multimeterModeLabel(m) }}</option>
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

    <!-- 2.6a ranging + NPLC + autoZero -->
    <details
      v-if="ranging?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Range &amp; integration</summary>
      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <label class="flex flex-col text-xs text-fg-muted">
          Range
          <select
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :value="ranging.current?.auto ? 'auto' : ranging.current?.upper"
            :disabled="controlsLocked"
            :title="lockTitle"
            @change="applyRange"
          >
            <option value="auto">Auto</option>
            <option
              v-for="r in availableRanges"
              :key="r.label"
              :value="r.upper"
            >{{ r.label }}</option>
          </select>
        </label>
        <label class="flex flex-col text-xs text-fg-muted">
          NPLC
          <select
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :value="ranging.nplc ?? ''"
            :disabled="controlsLocked"
            :title="lockTitle"
            @change="applyNplc"
          >
            <option v-for="n in ranging.capability?.nplc ?? []" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label v-if="ranging.capability?.autoZero" class="flex flex-col text-xs text-fg-muted">
          AutoZero
          <select
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :disabled="controlsLocked"
            :title="lockTitle"
            @change="applyAutoZero"
          >
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="once">Once</option>
          </select>
        </label>
      </div>
    </details>

    <!-- 2.6a trigger -->
    <details
      v-if="trigger?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Trigger</summary>
      <div class="mt-3 grid gap-3 md:grid-cols-4">
        <label class="flex flex-col text-xs text-fg-muted">
          Source
          <select
            v-model="triggerDraft.source"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option
              v-for="s in trigger.capability?.sources ?? []"
              :key="s"
              :value="s as MultimeterTriggerSource"
            >{{ s }}</option>
          </select>
        </label>
        <label class="flex flex-col text-xs text-fg-muted">
          Slope
          <select
            v-model="triggerDraft.slope"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option
              v-for="s in trigger.capability?.slopes ?? []"
              :key="s"
              :value="s as MultimeterTriggerSlope"
            >{{ s }}</option>
          </select>
        </label>
        <label class="flex flex-col text-xs text-fg-muted">
          Delay (s)
          <input
            v-model.number="triggerDraft.delaySec"
            type="number"
            step="0.001"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          />
        </label>
        <label class="flex flex-col text-xs text-fg-muted">
          Samples
          <input
            v-model.number="triggerDraft.sampleCount"
            type="number"
            min="1"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          />
        </label>
      </div>
      <div class="mt-3 flex gap-2">
        <button
          class="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg"
          :disabled="controlsLocked"
          :aria-disabled="controlsLocked"
          :title="lockTitle"
          @click="applyTrigger"
        >Apply</button>
        <button
          class="rounded-md border border-border px-3 py-1.5 text-sm"
          :disabled="controlsLocked"
          :aria-disabled="controlsLocked"
          :title="lockTitle"
          @click="fireTrigger"
        >Fire (software)</button>
      </div>
    </details>

    <!-- 2.6b math -->
    <details
      v-if="math?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Math</summary>
      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <label class="flex flex-col text-xs text-fg-muted">
          Function
          <select
            v-model="mathFn"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option v-for="f in math.capability?.functions ?? []" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label v-if="mathFn === 'null'" class="flex flex-col text-xs text-fg-muted">
          Null offset
          <input
            v-model="mathNull"
            type="number"
            step="any"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          />
        </label>
        <label v-if="mathFn === 'dbm'" class="flex flex-col text-xs text-fg-muted">
          dBm reference (Ω)
          <select
            v-model="mathDbm"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option v-for="r in math.capability?.dbmReferences ?? []" :key="r" :value="r.toString()">{{ r }}</option>
          </select>
        </label>
        <template v-if="mathFn === 'limit'">
          <label class="flex flex-col text-xs text-fg-muted">
            Upper
            <input
              v-model="mathLimitUpper"
              type="number"
              step="any"
              class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            />
          </label>
          <label class="flex flex-col text-xs text-fg-muted">
            Lower
            <input
              v-model="mathLimitLower"
              type="number"
              step="any"
              class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            />
          </label>
        </template>
      </div>
      <div v-if="math.state?.stats" class="mt-3 grid grid-cols-5 gap-2 text-xs font-mono">
        <div><span class="text-fg-muted">min</span> {{ formatSi(math.state.stats.min, "") }}</div>
        <div><span class="text-fg-muted">max</span> {{ formatSi(math.state.stats.max, "") }}</div>
        <div><span class="text-fg-muted">avg</span> {{ formatSi(math.state.stats.average, "") }}</div>
        <div><span class="text-fg-muted">σ</span> {{ formatSi(math.state.stats.stddev, "") }}</div>
        <div><span class="text-fg-muted">n</span> {{ math.state.stats.count }}</div>
      </div>
      <div class="mt-3 flex gap-2">
        <button
          class="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg"
          :disabled="controlsLocked"
          :aria-disabled="controlsLocked"
          :title="lockTitle"
          @click="applyMath"
        >Apply</button>
        <button
          v-if="mathFn === 'stats'"
          class="rounded-md border border-border px-3 py-1.5 text-sm"
          :disabled="controlsLocked"
          :aria-disabled="controlsLocked"
          :title="lockTitle"
          @click="resetStats"
        >Reset stats</button>
      </div>
    </details>

    <!-- 2.6b dual display -->
    <details
      v-if="dual?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Dual display</summary>
      <div class="mt-3 flex items-center gap-3">
        <label class="flex flex-col text-xs text-fg-muted">
          Secondary
          <select
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :value="dual.secondary ?? ''"
            :disabled="controlsLocked"
            :title="lockTitle"
            @change="applyDual"
          >
            <option value="">(off)</option>
            <option
              v-for="m in (selectedMode && dual.capability?.pairs[selectedMode]) || []"
              :key="m"
              :value="m"
            >{{ multimeterModeLabel(m) }}</option>
          </select>
        </label>
      </div>
    </details>

    <!-- 2.6c temperature -->
    <details
      v-if="temperature?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Temperature</summary>
      <div class="mt-3 grid gap-3 md:grid-cols-3">
        <label class="flex flex-col text-xs text-fg-muted">
          Unit
          <select
            v-model="tempUnit"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :disabled="controlsLocked"
            :title="lockTitle"
          >
            <option v-for="u in temperature.capability?.units ?? []" :key="u" :value="u">{{ u }}</option>
          </select>
        </label>
        <label class="flex flex-col text-xs text-fg-muted">
          Transducer
          <select
            v-model="tempTransducer"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :disabled="controlsLocked"
            :title="lockTitle"
          >
            <option v-for="t in temperature.capability?.transducers ?? []" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <div class="flex items-end">
          <button
            class="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg"
            :disabled="controlsLocked"
            :aria-disabled="controlsLocked"
            :title="lockTitle"
            @click="applyTemperature"
          >Apply</button>
        </div>
      </div>
    </details>

    <!-- 2.6c logging -->
    <details
      v-if="logging?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Trend logger</summary>
      <div class="mt-3 grid gap-3 md:grid-cols-4">
        <label class="flex flex-col text-xs text-fg-muted">
          Interval (ms)
          <input
            v-model="loggingInterval"
            type="number"
            :min="logging.capability?.minIntervalMs"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :disabled="controlsLocked"
            :title="lockTitle"
          />
        </label>
        <label class="flex flex-col text-xs text-fg-muted">
          Samples (blank = infinite)
          <input
            v-model="loggingTotal"
            type="number"
            min="1"
            class="mt-1 h-9 rounded-md border border-border bg-surface px-2 text-sm"
            :disabled="controlsLocked"
            :title="lockTitle"
          />
        </label>
        <div class="flex items-end gap-2">
          <button
            class="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg disabled:opacity-50"
            :disabled="logging.status?.running || controlsLocked"
            :aria-disabled="logging.status?.running || controlsLocked"
            :title="lockTitle"
            @click="startLogging"
          >Start</button>
          <button
            class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            :disabled="!logging.status?.running || controlsLocked"
            :aria-disabled="!logging.status?.running || controlsLocked"
            :title="lockTitle"
            @click="stopLogging"
          >Stop</button>
        </div>
        <div class="text-xs text-fg-muted self-end">
          <span v-if="logging.status?.running">
            {{ logging.status.samplesEmitted }} samples
          </span>
          <span v-else>Idle</span>
        </div>
      </div>
      <div v-if="loggingSamples.length" class="mt-3 font-mono text-xs text-fg-muted">
        Last {{ Math.min(loggingSamples.length, 5) }} samples:
        <span v-for="(s, i) in loggingSamples.slice(-5)" :key="i" class="ml-2">{{ formatSi(s.value, s.unit, 4) }}</span>
      </div>
    </details>

    <!-- 2.6c presets -->
    <details
      v-if="presets?.supported"
      class="col-span-full rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    >
      <summary class="cursor-pointer select-none text-sm font-semibold">Presets ({{ presets.slots }} slots)</summary>
      <div class="mt-3 grid grid-cols-5 gap-2 md:grid-cols-10">
        <div
          v-for="(occ, i) in presets.occupied"
          :key="i"
          class="flex flex-col items-center gap-1 rounded-md border border-border bg-surface-3 p-2"
        >
          <span class="text-xs font-semibold">{{ i }}</span>
          <span
            class="block h-1.5 w-full rounded-full"
            :class="occ ? 'bg-state-success' : 'bg-border'"
          />
          <button
            class="rounded bg-accent px-1 py-0.5 text-[10px] text-accent-fg"
            :disabled="controlsLocked"
            :aria-disabled="controlsLocked"
            :title="lockTitle"
            @click="savePreset(i)"
          >Save</button>
          <button
            class="rounded border border-border px-1 py-0.5 text-[10px] disabled:opacity-50"
            :disabled="!occ || controlsLocked"
            :aria-disabled="!occ || controlsLocked"
            :title="lockTitle"
            @click="recallPreset(i)"
          >Recall</button>
        </div>
      </div>
    </details>
  </div>
</template>
