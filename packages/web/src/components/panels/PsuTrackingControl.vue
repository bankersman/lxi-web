<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Waves } from "lucide-vue-next";
import { api, type PsuTrackingInfo } from "@/api/client";

const props = defineProps<{
  sessionId: string;
  enabled: boolean;
  /** Bump to force an immediate reload from the device. */
  refreshKey?: number;
}>();
const emit = defineEmits<{ change: [enabled: boolean] }>();

const info = ref<PsuTrackingInfo | null>(null);
const busy = ref(false);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const supported = computed(() => info.value?.supported === true);

async function load(): Promise<void> {
  try {
    info.value = await api.getPsuTracking(props.sessionId);
    loadError.value = null;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}

// Poll periodically so the toggle reflects the instrument's actual state
// (tracking can be toggled from the front panel or changed by *RCL too).
let pollTimer: ReturnType<typeof setInterval> | null = null;
function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!busy.value) void load();
  }, 3000);
}
function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
onBeforeUnmount(stopPolling);

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

async function toggle(): Promise<void> {
  if (!info.value || busy.value) return;
  const next = !info.value.enabled;
  busy.value = true;
  actionError.value = null;
  try {
    await api.setPsuTracking(props.sessionId, next);
    // Re-query the device so the UI reflects the *actual* state, not our
    // optimistic guess — catches silent rejections and keeps CH1/CH2 and
    // the toggle in lockstep.
    await load();
    emit("change", info.value?.enabled ?? next);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section
    v-if="supported"
    class="rounded-[var(--radius-card)] border border-border bg-surface-2 p-4"
    aria-labelledby="psu-tracking-heading"
  >
    <header class="mb-3 flex items-center gap-2">
      <span
        class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface-3 text-accent"
        aria-hidden="true"
      >
        <Waves class="h-4 w-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 id="psu-tracking-heading" class="text-sm font-semibold">Tracking</h3>
        <p class="text-xs text-fg-muted">
          Mirror set-voltage, set-current and output state across
          CH{{ info!.channels.join(" + CH") }}.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="info!.enabled"
        :disabled="!enabled || busy"
        class="relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        :class="info!.enabled ? 'bg-accent' : 'bg-surface-3'"
        @click="toggle"
      >
        <span class="sr-only">Tracking {{ info!.enabled ? "on" : "off" }}</span>
        <span
          class="inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform"
          :class="info!.enabled ? 'translate-x-6' : 'translate-x-1'"
          aria-hidden="true"
        />
      </button>
    </header>

    <p
      v-if="loadError || actionError"
      class="text-xs text-state-error"
      role="alert"
    >
      {{ actionError ?? loadError }}
    </p>
  </section>
</template>
