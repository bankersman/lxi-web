import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { readSafeModeFromStorage, writeSafeModeToStorage } from "@/lib/safeModeWriteBind";

export const SAFE_MODE_INTRO_KEY = "lxi-web.safeMode.intro.v1";

export const useSafeModeStore = defineStore("safeMode", () => {
  const enabled = ref(readSafeModeFromStorage());

  watch(
    enabled,
    (v) => {
      writeSafeModeToStorage(v);
    },
    { flush: "post" },
  );

  function toggle(): void {
    enabled.value = !enabled.value;
  }

  function set(value: boolean): void {
    enabled.value = value;
  }

  return { enabled, toggle, set };
});
