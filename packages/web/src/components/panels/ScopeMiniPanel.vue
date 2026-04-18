<script setup lang="ts">
import { ref } from "vue";
import { Activity } from "lucide-vue-next";
import { api } from "@/api/client";
import { useSafeModeGate } from "@/composables/useSafeModeGate";
import { formatTime } from "@/lib/format";

const props = defineProps<{ sessionId: string; disabled?: boolean }>();

const gate = useSafeModeGate();
const captureBtn = gate.bindWrite(() => Boolean(props.disabled) || busy.value);

const busy = ref(false);
const lastCapturedAt = ref<number | null>(null);
const errorMsg = ref<string | null>(null);

async function singleCapture(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  errorMsg.value = null;
  try {
    await api.singleCapture(props.sessionId);
    lastCapturedAt.value = Date.now();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-3 px-3 py-2">
    <div class="min-w-0">
      <p class="text-xs font-medium">Capture</p>
      <p class="truncate text-xs text-fg-muted" aria-live="polite">
        {{ lastCapturedAt ? `Last at ${formatTime(lastCapturedAt)}` : "No capture yet" }}
      </p>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
      v-bind="captureBtn"
      @click="singleCapture"
    >
      <Activity class="h-3.5 w-3.5" aria-hidden="true" />
      {{ busy ? "Capturing…" : "Single" }}
    </button>
  </div>
  <p v-if="errorMsg" class="text-xs text-state-error" role="alert">{{ errorMsg }}</p>
</template>
