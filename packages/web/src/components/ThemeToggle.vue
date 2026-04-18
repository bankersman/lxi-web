<script setup lang="ts">
import { computed } from "vue";
import { Moon, Sun } from "lucide-vue-next";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
const pressed = computed(() => theme.mode === "dark");
const label = computed(() =>
  pressed.value ? "Switch to light theme" : "Switch to dark theme",
);
</script>

<template>
  <button
    type="button"
    class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm font-medium text-fg hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    :aria-pressed="pressed"
    :aria-label="label"
    @click="theme.toggle"
  >
    <Sun v-if="!pressed" class="h-4 w-4" aria-hidden="true" />
    <Moon v-else class="h-4 w-4" aria-hidden="true" />
    <span>{{ pressed ? "Dark" : "Light" }}</span>
  </button>
</template>
