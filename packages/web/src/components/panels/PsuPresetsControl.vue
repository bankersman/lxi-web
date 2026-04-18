<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Save, Upload, Slash } from "lucide-vue-next";
import { api, type PsuPresetsInfo } from "@/api/client";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";

const props = defineProps<{
  sessionId: string;
  enabled: boolean;
  /** Bump to force a reload of the slot catalog. */
  refreshKey?: number;
}>();
const emit = defineEmits<{ recalled: [slot: number] }>();

const gate = useSafeModeGate();

const info = ref<PsuPresetsInfo | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busySlot = ref<number | null>(null);
/** When non-null, a save is pending confirmation to overwrite that slot. */
const confirmingSave = ref<number | null>(null);

const supported = computed(() => info.value?.supported === true);

async function load(): Promise<void> {
  try {
    info.value = await api.getPsuPresets(props.sessionId);
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

function requestSave(slot: number): void {
  if (!info.value) return;
  if (info.value.occupied[slot]) {
    confirmingSave.value = slot;
    return;
  }
  void doSave(slot);
}

async function doSave(slot: number): Promise<void> {
  busySlot.value = slot;
  actionError.value = null;
  confirmingSave.value = null;
  try {
    await api.savePsuPreset(props.sessionId, slot);
    await load();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busySlot.value = null;
  }
}

async function doRecall(slot: number): Promise<void> {
  busySlot.value = slot;
  actionError.value = null;
  try {
    await api.recallPsuPreset(props.sessionId, slot);
    emit("recalled", slot);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busySlot.value = null;
  }
}
</script>

<template>
  <section
    v-if="supported"
    class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    aria-labelledby="psu-presets-heading"
  >
    <header class="mb-3 flex items-center gap-2">
      <span
        class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface-3 text-accent"
        aria-hidden="true"
      >
        <Save class="h-4 w-4" />
      </span>
      <div>
        <h3 id="psu-presets-heading" class="text-sm font-semibold">Presets</h3>
        <p class="text-xs text-fg-muted">
          Save and recall the full PSU state (all channels, OVP/OCP, pairing)
          to one of {{ info!.slots }} internal memory slots.
        </p>
      </div>
    </header>

    <ul
      class="grid grid-cols-2 gap-2 sm:grid-cols-5"
      aria-label="Preset memory slots"
    >
      <li
        v-for="i in info!.slots"
        :key="i - 1"
        class="flex flex-col gap-1 rounded-md border border-border bg-surface-3 p-2"
      >
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-semibold">Slot {{ i - 1 }}</span>
          <span
            v-if="info!.occupied[i - 1]"
            class="inline-flex items-center gap-1 rounded-full bg-state-connected/15 px-1.5 py-0.5 text-[10px] font-medium text-state-connected"
            aria-label="Slot saved"
          >
            Saved
          </span>
          <span
            v-else
            class="inline-flex items-center gap-1 text-[10px] font-medium text-fg-muted"
            aria-label="Slot empty"
          >
            <Slash class="h-3 w-3" aria-hidden="true" /> Empty
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-surface px-2 py-1 text-[11px] font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!enabled || busySlot !== null || gate.enabled"
            :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
            :aria-label="`Save current state to slot ${i - 1}`"
            @click="requestSave(i - 1)"
          >
            <Save class="h-3 w-3" aria-hidden="true" />
            Save
          </button>
          <button
            type="button"
            class="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!enabled || busySlot !== null || !info!.occupied[i - 1] || gate.enabled"
            :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
            :aria-label="`Recall state from slot ${i - 1}`"
            @click="doRecall(i - 1)"
          >
            <Upload class="h-3 w-3" aria-hidden="true" />
            Recall
          </button>
        </div>
      </li>
    </ul>

    <p
      v-if="loadError || actionError"
      class="mt-2 text-xs text-state-error"
      role="alert"
    >
      {{ actionError ?? loadError }}
    </p>

    <div
      v-if="confirmingSave !== null"
      role="alertdialog"
      aria-labelledby="psu-preset-overwrite"
      class="mt-3 flex items-center justify-between gap-2 rounded-md border border-state-connecting/40 bg-state-connecting/10 p-3 text-xs"
    >
      <p id="psu-preset-overwrite" class="text-fg-muted">
        Overwrite slot {{ confirmingSave }}?
      </p>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="confirmingSave = null"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-state-connecting px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          :disabled="gate.enabled"
          :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
          @click="doSave(confirmingSave!)"
        >
          Overwrite
        </button>
      </div>
    </div>
  </section>
</template>
