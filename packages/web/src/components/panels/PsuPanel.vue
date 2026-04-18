<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Link2 } from "lucide-vue-next";
import { api, type PsuPairingInfo } from "@/api/client";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { useLiveReading } from "@/composables/useLiveReading";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";
import { formatSi } from "@/lib/format";
import type { PsuChannelState, PsuPairingMode } from "@lxi-web/core/browser";
import PsuPairingControl from "./PsuPairingControl.vue";
import PsuTrackingControl from "./PsuTrackingControl.vue";
import PsuPresetsControl from "./PsuPresetsControl.vue";
import PsuProtectionControl from "./PsuProtectionControl.vue";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const gate = useSafeModeGate();

const { data, error } = useLiveReading<PsuChannelState[]>(
  () => props.sessionId,
  "psu.channels",
  { enabled: computed(() => props.enabled) },
);

/**
 * WS drives the steady-state updates, but after an explicit user action
 * (Apply, Output toggle, preset recall, …) we hit the HTTP endpoint once
 * for immediate feedback instead of waiting up to one scheduler tick.
 */
async function refresh(): Promise<void> {
  try {
    data.value = await api.getPsuChannels(props.sessionId);
  } catch {
    /* the live feed will surface the next error */
  }
}

const pairing = ref<PsuPairingInfo | null>(null);
const enabledRef = computed(() => props.enabled);

async function loadPairing(): Promise<void> {
  try {
    pairing.value = await api.getPsuPairing(props.sessionId);
  } catch {
    pairing.value = null;
  }
}
watch(enabledRef, (on) => {
  if (on) void loadPairing();
}, { immediate: true });

function onPairingChanged(mode: PsuPairingMode): void {
  if (pairing.value) pairing.value = { ...pairing.value, mode };
  void refresh();
}

const pairMasterId = computed(() => pairing.value?.channels[0] ?? null);
const pairFollowerIds = computed(() =>
  pairing.value ? pairing.value.channels.slice(1) : [],
);
const isPaired = computed(
  () => pairing.value != null && pairing.value.mode !== "off",
);

function isMaster(id: number): boolean {
  return isPaired.value && id === pairMasterId.value;
}
function isMember(id: number): boolean {
  return (
    isPaired.value &&
    (id === pairMasterId.value || pairFollowerIds.value.includes(id))
  );
}
/**
 * Only parallel mode truly locks the follower: CH2 becomes a passive slave of
 * CH1's output. In series mode the user still sets each channel's voltage
 * independently (the two supplies are just wired together internally, so the
 * pair's total = CH1 + CH2). We therefore leave CH2's controls active in
 * series and only disable them in parallel.
 */
function isFollowerLocked(id: number): boolean {
  return (
    isPaired.value &&
    pairing.value!.mode === "parallel" &&
    pairFollowerIds.value.includes(id)
  );
}

const PAIR_LABEL: Record<PsuPairingMode, string> = {
  off: "",
  series: "Series",
  parallel: "Parallel",
};

function effectiveLimits(ch: PsuChannelState): { voltageMax: number; currentMax: number } {
  // Only the parallel master gets boosted limits — in series each channel's
  // own max stays 30V/3A and the combined output is the sum the user reads
  // at the terminals.
  if (
    isMaster(ch.id) &&
    pairing.value &&
    pairing.value.mode === "parallel"
  ) {
    return { voltageMax: ch.limits.voltageMax, currentMax: ch.limits.currentMax * 2 };
  }
  return ch.limits;
}

/**
 * User-editable set-point drafts. `lastSeen` is the last set-point we pulled
 * from the instrument — if the device-reported set-point changes (e.g. the
 * front panel was touched, a preset was recalled, or tracking slaved the
 * value across channels) AND the draft still matches the previous reading,
 * we quietly sync the draft to the new value. If the user has diverged from
 * the reading (mid-edit), we leave their draft alone so Apply still works.
 */
const draft = reactive<Record<number, { voltage: number; current: number }>>({});
const lastSeen = reactive<
  Record<number, { voltage: number; current: number }>
>({});
watch(data, (channels) => {
  if (!channels) return;
  for (const ch of channels) {
    const prev = lastSeen[ch.id];
    if (!(ch.id in draft) || !prev) {
      draft[ch.id] = { voltage: ch.setVoltage, current: ch.setCurrent };
    } else {
      const d = draft[ch.id]!;
      if (d.voltage === prev.voltage && ch.setVoltage !== prev.voltage) {
        d.voltage = ch.setVoltage;
      }
      if (d.current === prev.current && ch.setCurrent !== prev.current) {
        d.current = ch.setCurrent;
      }
    }
    lastSeen[ch.id] = { voltage: ch.setVoltage, current: ch.setCurrent };
  }
});

function resyncDrafts(): void {
  // Forget what we last saw so the next poll treats every channel as fresh
  // and replaces the draft with the live reading — used after an explicit
  // state-changing event (preset recall, pairing toggle) where stale drafts
  // would lie to the user.
  for (const key of Object.keys(lastSeen)) delete lastSeen[Number(key)];
  for (const key of Object.keys(draft)) delete draft[Number(key)];
}

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

// Bumped whenever something external (pairing change, preset recall, tracking
// toggle) may have altered channel/OVP/OCP values so child panels know to
// refetch without waiting for the next poll tick.
const refreshKey = ref(0);
function invalidateAll(): void {
  refreshKey.value += 1;
  void refresh();
  void loadPairing();
}

function onRecalled(): void {
  // A preset recall can rewrite every set-point, output state, OVP/OCP,
  // pairing and tracking mode in one shot. Drop any in-flight drafts so the
  // user doesn't see stale numbers in the Set voltage/current inputs.
  resyncDrafts();
  invalidateAll();
}

function onPairingChange(mode: PsuPairingMode): void {
  onPairingChanged(mode);
  invalidateAll();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PsuPairingControl
      :session-id="sessionId"
      :enabled="enabled"
      :refresh-key="refreshKey"
      @change="onPairingChange"
    />
    <PsuTrackingControl
      :session-id="sessionId"
      :enabled="enabled"
      :refresh-key="refreshKey"
      @change="invalidateAll"
    />
    <PsuPresetsControl
      :session-id="sessionId"
      :enabled="enabled"
      :refresh-key="refreshKey"
      @recalled="onRecalled"
    />

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
      <section
        v-for="ch in data ?? []"
        :key="ch.id"
        class="flex flex-col gap-3 rounded-[var(--radius-card)] border bg-surface-2 p-4 transition-opacity"
        :class="[
          isMaster(ch.id) ? 'border-accent/60' : 'border-border',
          isFollowerLocked(ch.id) ? 'opacity-60' : '',
        ]"
      >
        <header class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold">{{ ch.label }}</h3>
              <span
                v-if="isMember(ch.id) && pairing"
                class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent"
              >
                <Link2 class="h-3 w-3" aria-hidden="true" />
                {{ PAIR_LABEL[pairing.mode] }}
              </span>
            </div>
            <p class="text-xs text-fg-muted">
              <template v-if="isMaster(ch.id) && pairing?.mode === 'parallel'">
                Combined limits
                {{ formatSi(effectiveLimits(ch).voltageMax, "V", 2) }} /
                {{ formatSi(effectiveLimits(ch).currentMax, "A", 2) }}
              </template>
              <template v-else-if="isFollowerLocked(ch.id)">
                Controlled via CH{{ pairMasterId }}
              </template>
              <template v-else-if="isMember(ch.id) && pairing?.mode === 'series'">
                Sum of CH1 + CH2 appears across the pair
              </template>
              <template v-else>
                Limits {{ formatSi(ch.limits.voltageMax, "V", 2) }} /
                {{ formatSi(ch.limits.currentMax, "A", 2) }}
              </template>
            </p>
          </div>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :class="
              ch.output
                ? 'bg-state-connected/15 text-state-connected hover:bg-state-connected/25'
                : 'bg-surface-3 text-fg-muted hover:bg-surface'
            "
            :aria-pressed="ch.output"
            :disabled="isFollowerLocked(ch.id) || !enabled || gate.enabled"
            :aria-disabled="isFollowerLocked(ch.id) || !enabled || gate.enabled"
            :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
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

        <form
          class="flex flex-col gap-2 text-xs"
          :aria-disabled="isFollowerLocked(ch.id)"
          @submit.prevent="apply(ch)"
        >
          <label class="flex items-center justify-between gap-2">
            <span class="text-fg-muted">Set voltage (V)</span>
            <input
              v-model.number="draft[ch.id].voltage"
              type="number"
              step="any"
              :min="0"
              :max="effectiveLimits(ch).voltageMax"
              :disabled="isFollowerLocked(ch.id) || !enabled || gate.enabled"
              :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
              class="h-8 w-28 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
            />
          </label>
          <label class="flex items-center justify-between gap-2">
            <span class="text-fg-muted">Set current (A)</span>
            <input
              v-model.number="draft[ch.id].current"
              type="number"
              step="any"
              :min="0"
              :max="effectiveLimits(ch).currentMax"
              :disabled="isFollowerLocked(ch.id) || !enabled || gate.enabled"
              :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
              class="h-8 w-28 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
            />
          </label>
          <button
            type="submit"
            :disabled="isFollowerLocked(ch.id) || !enabled || gate.enabled"
            :aria-disabled="isFollowerLocked(ch.id) || !enabled || gate.enabled"
            :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
            class="mt-1 inline-flex items-center justify-center rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </form>

        <PsuProtectionControl
          :session-id="sessionId"
          :channel="ch.id"
          :enabled="enabled"
          :refresh-key="refreshKey"
          @change="refresh"
        />
      </section>

      <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
