<script setup lang="ts">
import { storeToRefs } from "pinia";
import { RouterView } from "vue-router";
import { useSafeModeHotkey } from "@/composables/useSafeModeHotkey";
import { useSafeModeStore } from "@/stores/safeMode";

const safe = useSafeModeStore();
const { enabled: safeModeOn } = storeToRefs(safe);
useSafeModeHotkey();
</script>

<template>
  <div
    class="safe-mode-shell"
    :data-safe-mode="safeModeOn ? 'on' : undefined"
  >
    <RouterView />
  </div>
</template>
