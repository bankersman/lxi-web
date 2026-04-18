<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { Shield, ShieldOff } from "lucide-vue-next";
import { useSafeModeStore, SAFE_MODE_INTRO_KEY } from "@/stores/safeMode";

const safe = useSafeModeStore();
const { enabled } = storeToRefs(safe);

const showIntro = ref(false);

watch(enabled, (on, wasOn) => {
  if (on && !wasOn && typeof localStorage !== "undefined") {
    if (!localStorage.getItem(SAFE_MODE_INTRO_KEY)) {
      showIntro.value = true;
      localStorage.setItem(SAFE_MODE_INTRO_KEY, "1");
    }
  }
});

const labelId = "safe-mode-toggle-label";
const statusText = computed(() => (enabled.value ? "On" : "Off"));
</script>

<template>
  <div class="flex max-w-md flex-col gap-1">
    <div class="flex flex-wrap items-center gap-2">
      <span :id="labelId" class="sr-only">Safe mode</span>
      <button
        type="button"
        class="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :class="enabled ? 'border-amber-600/50 bg-amber-500/10 text-amber-950 dark:text-amber-100' : ''"
        :aria-pressed="enabled"
        :aria-labelledby="labelId"
        @click="safe.toggle()"
      >
        <Shield v-if="enabled" class="h-4 w-4 shrink-0" aria-hidden="true" />
        <ShieldOff v-else class="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <span aria-hidden="true">Safe mode</span>
        <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          {{ statusText }}
        </span>
      </button>
      <span
        v-if="enabled"
        class="rounded border border-amber-600/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-950 dark:text-amber-50"
        role="status"
      >
        Safe mode — writes disabled
      </span>
    </div>
    <p
      v-if="showIntro && enabled"
      class="text-[11px] leading-snug text-fg-muted"
      role="note"
    >
      Safe mode only disables write actions in this browser. Instruments stay on the LAN — anyone
      with the address can still send SCPI (curl, scripts, other clients). Turn off when you need
      to change outputs or settings again.
      <button
        type="button"
        class="ml-1 underline decoration-dotted hover:text-fg"
        @click="showIntro = false"
      >
        Dismiss
      </button>
    </p>
  </div>
</template>
