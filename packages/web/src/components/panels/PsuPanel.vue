<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Link2 } from "lucide-vue-next";
import { api, type PsuPairingInfo } from "@/api/client";
import { usePolling } from "@/composables/usePolling";
import { formatSi } from "@/lib/format";
import type { PsuChannelState, PsuPairingMode } from "@lxi-web/core/browser";
import PsuPairingControl from "./PsuPairingControl.vue";

const props = defineProps<{ sessionId: string; enabled: boolean }>();

const { data, error, refresh } = usePolling<PsuChannelState[]>(
  () => api.getPsuChannels(props.sessionId),
  { intervalMs: 1500, enabled: computed(() => props.enabled) },
);

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
function isFollower(id: number): boolean {
  return isPaired.value && pairFollowerIds.value.includes(id);
}

const PAIR_LABEL: Record<PsuPairingMode, string> = {
  off: "",
  series: "Series",
  parallel: "Parallel",
};

function effectiveLimits(ch: PsuChannelState): { voltageMax: number; currentMax: number } {
  if (!isMaster(ch.id) || !pairing.value) return ch.limits;
  const mode = pairing.value.mode;
  if (mode === "series") return { voltageMax: ch.limits.voltageMax * 2, currentMax: ch.limits.currentMax };
  if (mode === "parallel") return { voltageMax: ch.limits.voltageMax, currentMax: ch.limits.currentMax * 2 };
  return ch.limits;
}

const draft = reactive<Record<number, { voltage: number; current: number }>>({});
watch(data, (channels) => {
  if (!channels) return;
  for (const ch of channels) {
    if (!(ch.id in draft)) {
      draft[ch.id] = { voltage: ch.setVoltage, current: ch.setCurrent };
    }
  }
});

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
</script>

<template>
  <div class="flex flex-col gap-4">
    <PsuPairingControl
      :session-id="sessionId"
      :enabled="enabled"
      @change="onPairingChanged"
    />

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
      <section
        v-for="ch in data ?? []"
        :key="ch.id"
        class="flex flex-col gap-3 rounded-[var(--radius-card)] border bg-surface-2 p-4 transition-opacity"
        :class="[
          isMaster(ch.id) ? 'border-accent/60' : 'border-border',
          isFollower(ch.id) ? 'opacity-60' : '',
        ]"
      >
        <header class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold">{{ ch.label }}</h3>
              <span
                v-if="isMaster(ch.id) && pairing"
                class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent"
              >
                <Link2 class="h-3 w-3" aria-hidden="true" />
                {{ PAIR_LABEL[pairing.mode] }}
                <span class="sr-only">
                  paired with CH{{ pairFollowerIds.join(", CH") }}
                </span>
              </span>
            </div>
            <p class="text-xs text-fg-muted">
              <template v-if="isMaster(ch.id)">
                Combined limits
                {{ formatSi(effectiveLimits(ch).voltageMax, "V", 2) }} /
                {{ formatSi(effectiveLimits(ch).currentMax, "A", 2) }}
              </template>
              <template v-else-if="isFollower(ch.id)">
                Controlled via CH{{ pairMasterId }}
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
            :disabled="isFollower(ch.id)"
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
          :aria-disabled="isFollower(ch.id)"
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
              :disabled="isFollower(ch.id)"
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
              :disabled="isFollower(ch.id)"
              class="h-8 w-28 rounded-md border border-border bg-surface px-2 text-right font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
            />
          </label>
          <button
            type="submit"
            :disabled="isFollower(ch.id)"
            class="mt-1 inline-flex items-center justify-center rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </form>
      </section>

      <p v-if="error" class="text-xs text-state-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
