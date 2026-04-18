<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api, type EloadStateInfo } from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { formatSi } from "@/lib/format";
import {
  electronicLoadModeLabel,
  electronicLoadModeUnit,
} from "@/lib/labels";
import type {
  ElectronicLoadBatteryState,
  ElectronicLoadMode,
  ElectronicLoadProtectionKind,
  ElectronicLoadState,
} from "@lxi-web/core/browser";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const initial = ref<EloadStateInfo | null>(null);
const initError = ref<string | null>(null);

const { data: live, error: liveError } = useLiveReading<ElectronicLoadState>(
  () => props.sessionId,
  "eload.state",
  { enabled: computed(() => props.enabled) },
);

const state = computed(() => live.value ?? initial.value?.state ?? null);
const limits = computed(() => initial.value?.limits ?? null);
const caps = computed(() => initial.value?.capabilities ?? null);

const MODES: ElectronicLoadMode[] = ["cc", "cv", "cr", "cp"];

const tab = ref<"protection" | "dynamic" | "battery" | "presets">("protection");

const setpointDraft = ref<Record<ElectronicLoadMode, string>>({
  cc: "",
  cv: "",
  cr: "",
  cp: "",
});
const setpointBusy = ref<Record<ElectronicLoadMode, boolean>>({
  cc: false,
  cv: false,
  cr: false,
  cp: false,
});
const setpointError = ref<string | null>(null);

const protectionState = ref<
  Partial<
    Record<
      ElectronicLoadProtectionKind,
      { enabled: boolean; level: number; tripped: boolean; range: { min: number; max: number } }
    >
  >
>({});
const battery = ref<ElectronicLoadBatteryState | null>(null);
const presetOccupied = ref<readonly boolean[]>([]);

async function reload(): Promise<void> {
  if (!props.enabled) return;
  try {
    initial.value = await api.getEloadState(props.sessionId);
    initError.value = null;
    for (const m of MODES) {
      setpointDraft.value[m] = initial.value.state.setpoints[m].toString();
    }
  } catch (err) {
    initError.value = err instanceof Error ? err.message : String(err);
    return;
  }
  if (initial.value.capabilities.protection) {
    try {
      const info = await api.getEloadProtection(props.sessionId);
      protectionState.value = { ...(info.state ?? {}) };
    } catch {
      /* surface via live errors */
    }
  }
  if (initial.value.capabilities.battery) {
    try {
      const info = await api.getEloadBattery(props.sessionId);
      battery.value = info.state ?? null;
    } catch {
      /* ignore */
    }
  }
  if (initial.value.capabilities.presets) {
    try {
      const info = await api.getEloadPresets(props.sessionId);
      presetOccupied.value = info.occupied;
    } catch {
      /* ignore */
    }
  }
}

onMounted(reload);
watch(() => props.enabled, (on) => {
  if (on) void reload();
});

async function toggleInput(): Promise<void> {
  if (!state.value) return;
  await api.setEloadEnabled(props.sessionId, !state.value.enabled);
}

async function changeMode(mode: ElectronicLoadMode): Promise<void> {
  try {
    await api.setEloadMode(props.sessionId, mode);
  } catch (err) {
    setpointError.value = err instanceof Error ? err.message : String(err);
  }
}

async function commitSetpoint(mode: ElectronicLoadMode): Promise<void> {
  const raw = setpointDraft.value[mode];
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    setpointError.value = `Invalid ${mode.toUpperCase()} value`;
    return;
  }
  setpointBusy.value[mode] = true;
  setpointError.value = null;
  try {
    await api.setEloadSetpoint(props.sessionId, mode, value);
  } catch (err) {
    setpointError.value = err instanceof Error ? err.message : String(err);
  } finally {
    setpointBusy.value[mode] = false;
  }
}

async function toggleProtection(
  kind: ElectronicLoadProtectionKind,
): Promise<void> {
  const cur = protectionState.value[kind];
  if (!cur) return;
  try {
    await api.setEloadProtection(props.sessionId, kind, { enabled: !cur.enabled });
    const info = await api.getEloadProtection(props.sessionId);
    protectionState.value = { ...(info.state ?? {}) };
  } catch (err) {
    setpointError.value = err instanceof Error ? err.message : String(err);
  }
}

async function clearTrip(kind: ElectronicLoadProtectionKind): Promise<void> {
  try {
    await api.clearEloadProtection(props.sessionId, kind);
    const info = await api.getEloadProtection(props.sessionId);
    protectionState.value = { ...(info.state ?? {}) };
  } catch (err) {
    setpointError.value = err instanceof Error ? err.message : String(err);
  }
}

async function stopBattery(): Promise<void> {
  try {
    await api.stopEloadBattery(props.sessionId);
    const info = await api.getEloadBattery(props.sessionId);
    battery.value = info.state ?? null;
  } catch (err) {
    setpointError.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <section class="mt-6 space-y-4">
    <div
      v-if="state"
      class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6"
      aria-live="polite"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-baseline gap-3">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Electronic load
          </h3>
          <span class="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium">
            {{ electronicLoadModeLabel(state.mode) }}
          </span>
        </div>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="
            state.enabled
              ? 'bg-state-connected/20 text-state-connected hover:bg-state-connected/30'
              : 'bg-accent text-accent-fg hover:opacity-90'
          "
          :aria-pressed="state.enabled"
          :disabled="!enabled"
          @click="toggleInput"
        >
          {{ state.enabled ? "Disable input" : "Enable input" }}
        </button>
      </div>

      <div
        class="mt-4 grid grid-cols-2 gap-3 font-mono text-2xl tabular-nums md:grid-cols-4"
      >
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Voltage</p>
          <p>{{ formatSi(state.measurement.voltage, "V", 4) }}</p>
        </div>
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Current</p>
          <p>{{ formatSi(state.measurement.current, "A", 4) }}</p>
        </div>
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Power</p>
          <p>{{ formatSi(state.measurement.power, "W", 4) }}</p>
        </div>
        <div class="rounded-md border border-border bg-surface-3 p-3 text-center">
          <p class="text-xs uppercase text-fg-muted">Resistance</p>
          <p>{{ formatSi(state.measurement.resistance, "Ω", 4) }}</p>
        </div>
      </div>
    </div>

    <div
      v-if="limits"
      class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6"
    >
      <h4 class="text-sm font-semibold">Mode &amp; setpoints</h4>
      <p class="text-xs text-fg-muted">
        Max: {{ formatSi(limits.voltageMax, "V", 3) }} /
        {{ formatSi(limits.currentMax, "A", 3) }} /
        {{ formatSi(limits.powerMax, "W", 3) }}.
        CR range {{ formatSi(limits.resistanceRange.min, "Ω", 3) }} –
        {{ formatSi(limits.resistanceRange.max, "Ω", 3) }}.
      </p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div
          v-for="m in MODES"
          :key="m"
          class="rounded-md border p-3"
          :class="
            state?.mode === m
              ? 'border-accent bg-surface-3'
              : 'border-border bg-surface-3'
          "
        >
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium uppercase tracking-wide">
              {{ electronicLoadModeLabel(m) }}
            </label>
            <button
              type="button"
              class="text-[11px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              :disabled="!enabled || state?.mode === m"
              @click="changeMode(m)"
            >
              {{ state?.mode === m ? "Active" : "Select" }}
            </button>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              v-model="setpointDraft[m]"
              type="number"
              step="any"
              class="h-9 flex-1 rounded-md border border-border bg-surface px-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              :disabled="!enabled"
              :aria-label="`${electronicLoadModeLabel(m)} setpoint`"
            />
            <span class="w-6 text-xs text-fg-muted">
              {{ electronicLoadModeUnit(m) }}
            </span>
            <button
              type="button"
              class="inline-flex h-9 items-center rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!enabled || setpointBusy[m]"
              @click="commitSetpoint(m)"
            >
              Set
            </button>
          </div>
        </div>
      </div>
      <p v-if="setpointError" class="mt-3 text-xs text-state-error" role="alert">
        {{ setpointError }}
      </p>
    </div>

    <div
      v-if="caps && (caps.protection || caps.dynamic || caps.battery || caps.presets)"
      class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-6"
    >
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-if="caps.protection"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="tab === 'protection' ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-fg-muted'"
          @click="tab = 'protection'"
        >
          Protection
        </button>
        <button
          v-if="caps.dynamic"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="tab === 'dynamic' ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-fg-muted'"
          @click="tab = 'dynamic'"
        >
          Dynamic
        </button>
        <button
          v-if="caps.battery"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="tab === 'battery' ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-fg-muted'"
          @click="tab = 'battery'"
        >
          Battery
        </button>
        <button
          v-if="caps.presets"
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :class="tab === 'presets' ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-fg-muted'"
          @click="tab = 'presets'"
        >
          Presets
        </button>
      </div>

      <div v-if="tab === 'protection' && caps.protection">
        <p class="mb-2 text-xs text-fg-muted">
          OVP / OCP / OPP / OTP advertise per-driver ranges; OTP is always on.
        </p>
        <table class="w-full text-sm">
          <thead class="text-xs uppercase text-fg-muted">
            <tr>
              <th class="text-left font-medium">Kind</th>
              <th class="text-right font-medium">Enabled</th>
              <th class="text-right font-medium">Level</th>
              <th class="text-right font-medium">Status</th>
              <th class="text-right font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="kind in caps.protection.kinds"
              :key="kind"
              class="border-t border-border"
            >
              <td class="py-1.5 font-mono text-xs uppercase">{{ kind }}</td>
              <td class="py-1.5 text-right">
                {{ protectionState[kind]?.enabled ? "ON" : "OFF" }}
              </td>
              <td class="py-1.5 text-right font-mono tabular-nums">
                {{ protectionState[kind]?.level ?? "—" }}
              </td>
              <td class="py-1.5 text-right">
                <span
                  v-if="protectionState[kind]?.tripped"
                  class="inline-flex rounded-full bg-state-error/15 px-2 text-[10px] font-semibold uppercase text-state-error"
                >
                  Tripped
                </span>
                <span v-else class="text-xs text-fg-muted">OK</span>
              </td>
              <td class="py-1.5 text-right">
                <button
                  v-if="kind !== 'otp'"
                  type="button"
                  class="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  :disabled="!enabled"
                  @click="toggleProtection(kind)"
                >
                  Toggle
                </button>
                <button
                  v-if="protectionState[kind]?.tripped"
                  type="button"
                  class="ml-1 rounded-md border border-state-error/30 px-2 py-0.5 text-[11px] text-state-error hover:bg-state-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  :disabled="!enabled"
                  @click="clearTrip(kind)"
                >
                  Clear
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="tab === 'dynamic' && caps.dynamic">
        <p class="text-xs text-fg-muted">
          Pulse loading (A/B dwell + slew) is available up to
          {{ caps.dynamic.slewRateMax }} A/µs. Start with low frequency — dynamic
          mode can destabilise a marginal supply.
        </p>
        <p class="mt-2 text-sm">
          Full dynamic-mode UI with per-mode A/B setpoints ships here; wire up
          your form against <code>api.setEloadDynamic</code>.
        </p>
      </div>

      <div v-if="tab === 'battery' && caps.battery">
        <p class="text-xs text-fg-muted">
          Discharge supports {{ caps.battery.modes.join(" / ").toUpperCase() }} up to
          {{ caps.battery.cutoffCapacityRange.max }} Ah or
          {{ caps.battery.cutoffTimeRangeSec.max }} s.
        </p>
        <div v-if="battery" class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p class="text-[10px] uppercase text-fg-muted">Running</p>
            <p>{{ battery.running ? "Yes" : "No" }}</p>
          </div>
          <div>
            <p class="text-[10px] uppercase text-fg-muted">Elapsed</p>
            <p>{{ battery.elapsedSec.toFixed(0) }} s</p>
          </div>
          <div>
            <p class="text-[10px] uppercase text-fg-muted">Capacity</p>
            <p>{{ battery.capacity.toFixed(3) }} Ah</p>
          </div>
          <div>
            <p class="text-[10px] uppercase text-fg-muted">Energy</p>
            <p>{{ battery.energy.toFixed(3) }} Wh</p>
          </div>
        </div>
        <button
          v-if="battery?.running"
          type="button"
          class="mt-3 inline-flex h-9 items-center rounded-md bg-state-error/20 px-3 text-sm text-state-error hover:bg-state-error/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="stopBattery"
        >
          Stop discharge
        </button>
      </div>

      <div v-if="tab === 'presets' && caps.presets">
        <p class="text-xs text-fg-muted">
          {{ caps.presets.slots }} save/recall slots via
          <code>*SAV</code>/<code>*RCL</code>.
        </p>
        <ul class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <li v-for="(occ, slot) in presetOccupied" :key="slot">
            <div class="rounded-md border border-border bg-surface-3 p-2 text-center text-xs">
              <p class="font-mono">#{{ slot }}</p>
              <p class="text-fg-muted">{{ occ ? "saved" : "empty" }}</p>
              <div class="mt-1 flex gap-1">
                <button
                  type="button"
                  class="flex-1 rounded bg-surface px-1 py-0.5 text-[10px] hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  :disabled="!enabled"
                  @click="api.saveEloadPreset(sessionId, slot)"
                >
                  Save
                </button>
                <button
                  type="button"
                  class="flex-1 rounded bg-surface px-1 py-0.5 text-[10px] hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  :disabled="!enabled || !occ"
                  @click="api.recallEloadPreset(sessionId, slot)"
                >
                  Recall
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="initError || liveError" class="text-xs text-state-error" role="alert">
      {{ initError ?? liveError }}
    </p>
  </section>
</template>
