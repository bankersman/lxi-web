<script setup lang="ts">
import { computed } from "vue";
import type { SessionStatus } from "@lxi-web/core/browser";

const props = defineProps<{ status: SessionStatus }>();

const classes = computed(() => {
  switch (props.status) {
    case "connected":
      return "bg-state-connected";
    case "connecting":
      return "bg-state-connecting animate-pulse";
    case "error":
      return "bg-state-error";
    default:
      return "bg-state-idle";
  }
});

const label = computed(() => {
  switch (props.status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "error":
      return "Error";
  }
});
</script>

<template>
  <span class="inline-flex items-center gap-2 text-xs font-medium">
    <span class="h-2 w-2 rounded-full" :class="classes" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>
