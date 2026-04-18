<script setup lang="ts">
import { ref, watch } from "vue";
import { Link2, AlertTriangle } from "lucide-vue-next";
import type { PsuPairingMode } from "@lxi-web/core/browser";
import { api, type PsuPairingInfo } from "@/api/client";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";

const props = defineProps<{
  sessionId: string;
  enabled: boolean;
  /** Bump to force an immediate reload from the device. */
  refreshKey?: number;
}>();
const emit = defineEmits<{ change: [mode: PsuPairingMode] }>();

const gate = useSafeModeGate();

const info = ref<PsuPairingInfo | null>(null);
const loadError = ref<string | null>(null);
const busy = ref(false);
const actionError = ref<string | null>(null);
const confirming = ref<PsuPairingMode | null>(null);

const MODE_LABELS: Record<PsuPairingMode, string> = {
  off: "Independent",
  series: "Series",
  parallel: "Parallel",
};

const MODE_HINTS: Record<PsuPairingMode, string> = {
  off: "Each channel controlled separately.",
  series: "CH1 + CH2 wired in series — doubles max voltage.",
  parallel: "CH1 + CH2 wired in parallel — doubles max current.",
};

async function load(): Promise<void> {
  try {
    info.value = await api.getPsuPairing(props.sessionId);
    loadError.value = null;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}

watch(
  () => props.enabled,
  (on) => {
    if (on) void load();
  },
  { immediate: true },
);

watch(
  () => props.refreshKey,
  () => {
    if (props.enabled) void load();
  },
);

function requestChange(mode: PsuPairingMode): void {
  if (!info.value || busy.value) return;
  if (mode === info.value.mode) return;
  confirming.value = mode;
}

async function confirm(): Promise<void> {
  const target = confirming.value;
  if (!target || !info.value) return;
  busy.value = true;
  actionError.value = null;
  try {
    await api.setPsuPairing(props.sessionId, target);
    emit("change", target);
    await load();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
    confirming.value = null;
  }
}

function cancel(): void {
  confirming.value = null;
}
</script>

<template>
  <section
    v-if="info?.supported"
    class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    aria-labelledby="psu-pairing-heading"
  >
    <header class="mb-3 flex items-center gap-2">
      <span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface-3 text-accent" aria-hidden="true">
        <Link2 class="h-4 w-4" />
      </span>
      <div>
        <h3 id="psu-pairing-heading" class="text-sm font-semibold">Channel coupling</h3>
        <p class="text-xs text-fg-muted">
          Affects CH{{ info.channels.join(" + CH") }}. CH3 stays independent.
        </p>
      </div>
    </header>

    <div role="radiogroup" aria-label="Channel pairing mode" class="grid gap-2 sm:grid-cols-3">
      <button
        v-for="mode in info.modes"
        :key="mode"
        type="button"
        role="radio"
        :aria-checked="info.mode === mode"
        :disabled="!enabled || busy || gate.enabled"
        :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
        class="flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        :class="
          info.mode === mode
            ? 'border-accent bg-accent/10 text-fg'
            : 'border-border bg-surface-3 text-fg hover:bg-surface'
        "
        @click="requestChange(mode)"
      >
        <span class="text-sm font-semibold">{{ MODE_LABELS[mode] }}</span>
        <span class="text-[11px] text-fg-muted">{{ MODE_HINTS[mode] }}</span>
      </button>
    </div>

    <p
      v-if="loadError || actionError"
      class="mt-2 text-xs text-state-error"
      role="alert"
    >
      {{ actionError ?? loadError }}
    </p>

    <div
      v-if="confirming"
      role="alertdialog"
      aria-labelledby="psu-pairing-confirm"
      aria-describedby="psu-pairing-confirm-desc"
      class="mt-3 flex flex-col gap-2 rounded-md border border-state-connecting/40 bg-state-connecting/10 p-3 text-xs"
    >
      <div class="flex items-start gap-2">
        <AlertTriangle
          class="mt-0.5 h-4 w-4 flex-none text-state-connecting"
          aria-hidden="true"
        />
        <div>
          <p id="psu-pairing-confirm" class="font-semibold">
            Switch to {{ MODE_LABELS[confirming] }}?
          </p>
          <p id="psu-pairing-confirm-desc" class="text-fg-muted">
            Make sure the physical wiring matches the new coupling before
            enabling outputs. All channel outputs will be turned off on change.
          </p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-state-connecting px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
          :disabled="busy || gate.enabled"
          :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
          @click="confirm"
        >
          {{ busy ? "Applying…" : "Confirm" }}
        </button>
      </div>
    </div>
  </section>
</template>
