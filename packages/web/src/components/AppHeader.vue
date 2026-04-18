<script setup lang="ts">
import { computed } from "vue";
import { Activity } from "lucide-vue-next";
import ThemeToggle from "./ThemeToggle.vue";
import PanicStopControl from "./PanicStopControl.vue";
import SafeModeControl from "./SafeModeControl.vue";
import { useSessionsStore } from "@/stores/sessions";

const sessions = useSessionsStore();
const wsLabel = computed(() =>
  sessions.wsConnected ? "Live feed connected" : "Live feed offline",
);
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur"
  >
    <a href="#main" class="sr-only focus:not-sr-only focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
      Skip to main content
    </a>
    <div class="flex items-center gap-3">
      <Activity class="h-5 w-5 text-accent" aria-hidden="true" />
      <h1 class="text-base font-semibold tracking-tight">lxi-web</h1>
      <span class="text-xs text-fg-muted">bench instrument dashboard</span>
    </div>
    <div class="flex flex-wrap items-center justify-end gap-3">
      <SafeModeControl />
      <PanicStopControl />
      <span
        class="flex items-center gap-2 text-xs text-fg-muted"
        role="status"
        :aria-label="wsLabel"
      >
        <span
          class="h-2 w-2 rounded-full"
          :class="sessions.wsConnected ? 'bg-state-connected' : 'bg-state-idle'"
          aria-hidden="true"
        />
        {{ sessions.wsConnected ? "live" : "offline" }}
      </span>
      <ThemeToggle />
    </div>
  </header>
</template>
