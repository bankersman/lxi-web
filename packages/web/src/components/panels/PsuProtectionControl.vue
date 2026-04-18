<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-vue-next";
import type {
  PsuProtectionKind,
  PsuProtectionState,
} from "@lxi-web/core/browser";
import { api, type PsuChannelProtectionInfo } from "@/api/client";

const props = defineProps<{
  sessionId: string;
  channel: number;
  /** When the parent panel is not visible we skip polling. */
  enabled: boolean;
  /**
   * Bump this number to trigger an immediate reload (e.g. after a preset
   * recall or a pairing change that may update OVP/OCP levels).
   */
  refreshKey?: number;
}>();
const emit = defineEmits<{ change: [] }>();

const info = ref<PsuChannelProtectionInfo | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busy = reactive<Record<PsuProtectionKind, boolean>>({ ovp: false, ocp: false });
/** Editable level drafts keyed by kind (sync from remote). */
const draft = reactive<Record<PsuProtectionKind, number>>({ ovp: 0, ocp: 0 });

const KIND_LABEL: Record<PsuProtectionKind, string> = {
  ovp: "Over-voltage",
  ocp: "Over-current",
};
const KIND_UNIT: Record<PsuProtectionKind, string> = { ovp: "V", ocp: "A" };

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  try {
    const next = await api.getPsuProtection(props.sessionId, props.channel);
    info.value = next;
    // Only sync draft from remote when the user is not mid-edit.
    if (!busy.ovp) draft.ovp = next.ovp.level;
    if (!busy.ocp) draft.ocp = next.ocp.level;
    loadError.value = null;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => void load(), 3000);
}
function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

watch(
  () => props.enabled,
  (on) => {
    if (on) {
      void load();
      startPolling();
    } else {
      stopPolling();
    }
  },
  { immediate: true },
);

watch(
  () => props.refreshKey,
  () => {
    if (props.enabled) void load();
  },
);

async function toggle(kind: PsuProtectionKind): Promise<void> {
  if (!info.value) return;
  const current = info.value[kind];
  busy[kind] = true;
  actionError.value = null;
  try {
    await api.setPsuProtection(props.sessionId, props.channel, kind, {
      enabled: !current.enabled,
    });
    await load();
    emit("change");
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy[kind] = false;
  }
}

async function applyLevel(kind: PsuProtectionKind): Promise<void> {
  const value = draft[kind];
  if (!Number.isFinite(value)) return;
  busy[kind] = true;
  actionError.value = null;
  try {
    await api.setPsuProtection(props.sessionId, props.channel, kind, {
      level: value,
    });
    await load();
    emit("change");
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy[kind] = false;
  }
}

async function clear(kind: PsuProtectionKind): Promise<void> {
  busy[kind] = true;
  actionError.value = null;
  try {
    await api.clearPsuProtectionTrip(props.sessionId, props.channel, kind);
    await load();
    emit("change");
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy[kind] = false;
  }
}

const anyTripped = computed(
  () => info.value != null && (info.value.ovp.tripped || info.value.ocp.tripped),
);

function summary(state: PsuProtectionState, unit: string): string {
  if (state.tripped) return "Tripped";
  if (!state.enabled) return "Off";
  return `Arm @ ${state.level.toFixed(3)} ${unit}`;
}
</script>

<template>
  <details
    class="rounded-md border border-border bg-surface-3 text-xs"
    :class="anyTripped ? 'border-state-error/60' : ''"
  >
    <summary
      class="flex cursor-pointer select-none items-center justify-between gap-2 px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span class="inline-flex items-center gap-1.5 font-medium">
        <ShieldAlert
          v-if="anyTripped"
          class="h-3.5 w-3.5 text-state-error"
          aria-hidden="true"
        />
        <ShieldCheck
          v-else-if="info && (info.ovp.enabled || info.ocp.enabled)"
          class="h-3.5 w-3.5 text-state-connected"
          aria-hidden="true"
        />
        <Shield v-else class="h-3.5 w-3.5 text-fg-muted" aria-hidden="true" />
        Protection
      </span>
      <span class="text-[10px] text-fg-muted">
        <template v-if="info">
          OVP: {{ summary(info.ovp, "V") }} · OCP: {{ summary(info.ocp, "A") }}
        </template>
        <template v-else-if="loadError">error</template>
        <template v-else>loading…</template>
      </span>
    </summary>

    <div v-if="info" class="flex flex-col gap-2 px-2.5 pb-2.5 pt-1">
      <div
        v-for="kind in (['ovp', 'ocp'] as PsuProtectionKind[])"
        :key="kind"
        class="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2"
        :class="info[kind].tripped ? 'ring-1 ring-state-error/60' : ''"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            role="switch"
            :aria-checked="info[kind].enabled"
            :aria-label="`${KIND_LABEL[kind]} protection`"
            :disabled="!enabled || busy[kind]"
            class="relative inline-flex h-5 w-9 flex-none items-center rounded-full border border-border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :class="info[kind].enabled ? 'bg-accent' : 'bg-surface-3'"
            @click="toggle(kind)"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-surface shadow transition-transform"
              :class="info[kind].enabled ? 'translate-x-5' : 'translate-x-0.5'"
              aria-hidden="true"
            />
          </button>
          <span class="text-[11px] font-medium">
            {{ KIND_LABEL[kind] }}
            <span
              v-if="info[kind].tripped"
              class="ml-1 inline-flex items-center rounded-full bg-state-error/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-error"
            >
              Tripped
            </span>
          </span>
        </div>

        <label class="flex items-center gap-1">
          <span class="sr-only">{{ KIND_LABEL[kind] }} level</span>
          <input
            v-model.number="draft[kind]"
            type="number"
            step="any"
            :min="info[kind].range.min"
            :max="info[kind].range.max"
            :disabled="!enabled || busy[kind]"
            class="h-7 w-24 rounded-md border border-border bg-surface px-1.5 text-right font-mono text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
          />
          <span class="text-[10px] text-fg-muted">{{ KIND_UNIT[kind] }}</span>
        </label>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!enabled || busy[kind] || draft[kind] === info[kind].level"
            @click="applyLevel(kind)"
          >
            Set
          </button>
          <button
            v-if="info[kind].tripped"
            type="button"
            class="rounded-md bg-state-error px-2 py-1 text-[11px] font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!enabled || busy[kind]"
            @click="clear(kind)"
          >
            Clear
          </button>
        </div>
      </div>

      <p
        v-if="loadError || actionError"
        class="text-[11px] text-state-error"
        role="alert"
      >
        {{ actionError ?? loadError }}
      </p>
    </div>
  </details>
</template>
