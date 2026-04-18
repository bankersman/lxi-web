<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api, type SgChannelsInfo } from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { formatSi } from "@/lib/format";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";
import { signalGeneratorWaveformLabel } from "@/lib/labels";
import type {
  SignalGeneratorChannelState,
  SignalGeneratorOutputImpedance,
  SignalGeneratorWaveform,
  SignalGeneratorWaveformType,
} from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const gate = useSafeModeGate();
const controlsLocked = computed(() => !props.enabled || gate.enabled);
const lockTitle = computed(() => (gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined));

const initial = ref<SgChannelsInfo | null>(null);
const initError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const { data: live, error: liveError } = useLiveReading<
  readonly SignalGeneratorChannelState[]
>(() => props.sessionId, "sg.channels", {
  enabled: computed(() => props.enabled),
});

const channels = computed<readonly SignalGeneratorChannelState[]>(
  () => live.value ?? initial.value?.channels ?? [],
);
const caps = computed(() => initial.value?.capabilities ?? null);

interface WaveformDraft {
  type: SignalGeneratorWaveformType;
  frequencyHz: string;
  amplitudeVpp: string;
  offsetV: string;
  dutyPct: string;
  symmetryPct: string;
  widthS: string;
  phaseDeg: string;
}

const draft = reactive<Record<number, WaveformDraft>>({});

function seedDraft(ch: SignalGeneratorChannelState): void {
  const w = ch.waveform;
  draft[ch.id] = {
    type: w.type,
    frequencyHz:
      "frequencyHz" in w && typeof w.frequencyHz === "number"
        ? String(w.frequencyHz)
        : String(ch.actual.frequencyHz),
    amplitudeVpp:
      "amplitudeVpp" in w && typeof w.amplitudeVpp === "number"
        ? String(w.amplitudeVpp)
        : String(ch.actual.amplitudeVpp),
    offsetV:
      "offsetV" in w && typeof w.offsetV === "number"
        ? String(w.offsetV)
        : String(ch.actual.offsetV),
    dutyPct:
      w.type === "square" && typeof w.dutyPct === "number"
        ? String(w.dutyPct)
        : "50",
    symmetryPct:
      w.type === "ramp" && typeof w.symmetryPct === "number"
        ? String(w.symmetryPct)
        : "50",
    widthS:
      w.type === "pulse" && typeof w.widthS === "number"
        ? String(w.widthS)
        : "0.001",
    phaseDeg:
      "phaseDeg" in w && typeof w.phaseDeg === "number"
        ? String(w.phaseDeg)
        : "0",
  };
}

async function reload(): Promise<void> {
  if (!props.enabled) return;
  try {
    initial.value = await api.getSgChannels(props.sessionId);
    initError.value = null;
    for (const ch of initial.value.channels) seedDraft(ch);
  } catch (err) {
    initError.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(reload);
watch(
  () => props.enabled,
  (on) => {
    if (on) void reload();
  },
);
watch(channels, (list) => {
  for (const ch of list) {
    if (!draft[ch.id]) seedDraft(ch);
  }
});

const WAVEFORMS: SignalGeneratorWaveformType[] = [
  "sine",
  "square",
  "ramp",
  "pulse",
  "noise",
  "dc",
  "arbitrary",
];

async function toggleChannel(ch: SignalGeneratorChannelState): Promise<void> {
  actionError.value = null;
  try {
    await api.setSgEnabled(props.sessionId, ch.id, !ch.enabled);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

async function setImpedance(
  ch: SignalGeneratorChannelState,
  mode: SignalGeneratorOutputImpedance,
): Promise<void> {
  actionError.value = null;
  try {
    await api.setSgImpedance(props.sessionId, ch.id, mode);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

function buildWaveform(
  d: WaveformDraft,
): SignalGeneratorWaveform | null {
  const freq = Number(d.frequencyHz);
  const amp = Number(d.amplitudeVpp);
  const offset = Number(d.offsetV);
  const phase = Number(d.phaseDeg);
  if (d.type === "dc") {
    if (!Number.isFinite(offset)) return null;
    return { type: "dc", offsetV: offset };
  }
  if (d.type === "noise") {
    if (!Number.isFinite(amp) || !Number.isFinite(offset)) return null;
    return { type: "noise", amplitudeVpp: amp, offsetV: offset };
  }
  if (
    !Number.isFinite(freq) ||
    !Number.isFinite(amp) ||
    !Number.isFinite(offset)
  ) {
    return null;
  }
  const base = {
    frequencyHz: freq,
    amplitudeVpp: amp,
    offsetV: offset,
    phaseDeg: Number.isFinite(phase) ? phase : undefined,
  };
  switch (d.type) {
    case "sine":
      return { type: "sine", ...base };
    case "square":
      return {
        type: "square",
        ...base,
        dutyPct: Number(d.dutyPct),
      };
    case "ramp":
      return {
        type: "ramp",
        ...base,
        symmetryPct: Number(d.symmetryPct),
      };
    case "pulse":
      return {
        type: "pulse",
        ...base,
        widthS: Number(d.widthS),
      };
    case "arbitrary":
      return { type: "arbitrary", ...base };
    default:
      return null;
  }
}

async function applyWaveform(ch: SignalGeneratorChannelState): Promise<void> {
  const d = draft[ch.id];
  if (!d) return;
  const waveform = buildWaveform(d);
  if (!waveform) {
    actionError.value = "Invalid waveform parameters";
    return;
  }
  actionError.value = null;
  try {
    await api.setSgWaveform(props.sessionId, ch.id, waveform);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <section class="mt-6 space-y-4">
    <div
      v-for="ch in channels"
      :key="ch.id"
      class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-baseline gap-3">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {{ ch.label ?? `Channel ${ch.id}` }}
          </h3>
          <span class="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium">
            {{ signalGeneratorWaveformLabel(ch.waveform.type) }}
          </span>
          <span
            v-if="ch.impedance === 'highZ'"
            class="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium"
          >
            Hi-Z
          </span>
        </div>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="
            ch.enabled
              ? 'bg-state-connected/20 text-state-connected hover:bg-state-connected/30'
              : 'bg-accent text-accent-fg hover:opacity-90'
          "
          :aria-pressed="ch.enabled"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="toggleChannel(ch)"
        >
          {{ ch.enabled ? "Disable output" : "Enable output" }}
        </button>
      </div>

      <div
        class="mt-4 grid grid-cols-2 gap-3 font-mono text-2xl tabular-nums md:grid-cols-3"
      >
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Frequency</p>
          <p>{{ formatSi(ch.actual.frequencyHz, "Hz", 4) }}</p>
        </div>
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Amplitude</p>
          <p>{{ formatSi(ch.actual.amplitudeVpp, "Vpp", 4) }}</p>
        </div>
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Offset</p>
          <p>{{ formatSi(ch.actual.offsetV, "V", 4) }}</p>
        </div>
      </div>

      <div v-if="draft[ch.id]" class="mt-4 grid gap-3 md:grid-cols-2">
        <label class="flex flex-col text-xs">
          <span class="font-medium uppercase tracking-wide">Waveform</span>
          <select
            v-model="draft[ch.id].type"
            class="h-9 rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked"
            :title="lockTitle"
          >
            <option v-for="w in WAVEFORMS" :key="w" :value="w">
              {{ signalGeneratorWaveformLabel(w) }}
            </option>
          </select>
        </label>
        <label class="flex flex-col text-xs">
          <span class="font-medium uppercase tracking-wide">Frequency (Hz)</span>
          <input
            v-model="draft[ch.id].frequencyHz"
            type="number"
            step="any"
            class="h-9 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked || draft[ch.id].type === 'dc' || draft[ch.id].type === 'noise'"
            :title="lockTitle"
          />
        </label>
        <label class="flex flex-col text-xs">
          <span class="font-medium uppercase tracking-wide">Amplitude (Vpp)</span>
          <input
            v-model="draft[ch.id].amplitudeVpp"
            type="number"
            step="any"
            class="h-9 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked || draft[ch.id].type === 'dc'"
            :title="lockTitle"
          />
        </label>
        <label class="flex flex-col text-xs">
          <span class="font-medium uppercase tracking-wide">Offset (V)</span>
          <input
            v-model="draft[ch.id].offsetV"
            type="number"
            step="any"
            class="h-9 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked"
            :title="lockTitle"
          />
        </label>
        <label
          v-if="draft[ch.id].type === 'square'"
          class="flex flex-col text-xs"
        >
          <span class="font-medium uppercase tracking-wide">Duty (%)</span>
          <input
            v-model="draft[ch.id].dutyPct"
            type="number"
            step="any"
            class="h-9 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked"
            :title="lockTitle"
          />
        </label>
        <label
          v-if="draft[ch.id].type === 'ramp'"
          class="flex flex-col text-xs"
        >
          <span class="font-medium uppercase tracking-wide">Symmetry (%)</span>
          <input
            v-model="draft[ch.id].symmetryPct"
            type="number"
            step="any"
            class="h-9 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked"
            :title="lockTitle"
          />
        </label>
        <label
          v-if="draft[ch.id].type === 'pulse'"
          class="flex flex-col text-xs"
        >
          <span class="font-medium uppercase tracking-wide">Width (s)</span>
          <input
            v-model="draft[ch.id].widthS"
            type="number"
            step="any"
            class="h-9 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            :disabled="controlsLocked"
            :title="lockTitle"
          />
        </label>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="applyWaveform(ch)"
        >
          Apply waveform
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center rounded-md border border-border bg-surface-3 px-3 text-xs hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="setImpedance(ch, '50ohm')"
        >
          50 Ω
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center rounded-md border border-border bg-surface-3 px-3 text-xs hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :disabled="controlsLocked"
          :title="lockTitle"
          @click="setImpedance(ch, 'highZ')"
        >
          Hi-Z
        </button>
      </div>
    </div>

    <div
      v-if="caps"
      class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6 text-sm text-fg-muted"
    >
      <h4 class="mb-2 text-sm font-semibold uppercase tracking-wide">
        Advanced capabilities
      </h4>
      <ul class="grid gap-1 md:grid-cols-2">
        <li v-if="caps.modulation">
          Modulation: {{ caps.modulation.types.join(", ") }}
        </li>
        <li v-if="caps.sweep">
          Sweep: {{ caps.sweep.spacings.join(", ") }}
        </li>
        <li v-if="caps.burst">
          Burst: {{ caps.burst.modes.join(", ") }}
        </li>
        <li v-if="caps.arbitrary">
          Arbitrary: up to {{ caps.arbitrary.maxSamples.toLocaleString() }} samples
        </li>
        <li v-if="caps.sync">
          Sync channels: {{ caps.sync.channels.join(", ") }}
        </li>
        <li v-if="caps.presets">Preset slots: {{ caps.presets.slots }}</li>
      </ul>
      <p class="mt-2 text-xs">
        Use the REST API (<code>api.setSgModulation</code>,
        <code>api.setSgSweep</code>, <code>api.setSgBurst</code>,
        <code>api.uploadSgArbitrary</code>) to drive these features until the
        full UI ships.
      </p>
    </div>

    <p
      v-if="initError || liveError || actionError"
      class="text-xs text-state-error"
      role="alert"
    >
      {{ initError ?? liveError ?? actionError }}
    </p>
  </section>
</template>
