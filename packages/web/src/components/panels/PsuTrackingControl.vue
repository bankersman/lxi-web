<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Waves } from "lucide-vue-next";
import { api, type PsuTrackingInfo } from "@/api/client";
import { useLiveReading } from "@/composables/useLiveReading";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { SAFE_MODE_WRITE_TITLE } from "@/lib/safeModeWriteBind";

const props = defineProps<{
  sessionId: string;
  enabled: boolean;
  /** Bump to force an immediate reload from the device. */
  refreshKey?: number;
}>();
const emit = defineEmits<{ change: [enabled: boolean] }>();

const gate = useSafeModeGate();

/**
 * `psu.tracking` is pushed over WebSocket (refcounted at the store so this
 * panel and anything else interested share a single device poll). We only
 * hit HTTP for explicit post-write refreshes so the toggle reflects reality
 * without waiting for the next scheduler tick.
 */
const live = useLiveReading<PsuTrackingInfo>(
  () => props.sessionId,
  "psu.tracking",
  { enabled: computed(() => props.enabled) },
);

const info = ref<PsuTrackingInfo | null>(null);
const busy = ref(false);
const actionError = ref<string | null>(null);

watch(
  live.data,
  (next) => {
    if (next) info.value = next;
  },
  { immediate: true },
);

const supported = computed(() => info.value?.supported === true);
const loadError = computed(() => live.error.value);

async function refresh(): Promise<void> {
  try {
    info.value = await api.getPsuTracking(props.sessionId);
  } catch {
    /* next WS frame will surface the error */
  }
}

watch(
  () => props.refreshKey,
  () => {
    if (props.enabled) void refresh();
  },
);

async function toggle(): Promise<void> {
  if (!info.value || busy.value) return;
  const next = !info.value.enabled;
  busy.value = true;
  actionError.value = null;
  try {
    await api.setPsuTracking(props.sessionId, next);
    await refresh();
    emit("change", info.value?.enabled ?? next);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
    await refresh();
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
        :disabled="!enabled || busy || gate.enabled"
        :aria-disabled="!enabled || busy || gate.enabled"
        :title="gate.enabled ? SAFE_MODE_WRITE_TITLE : undefined"
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
