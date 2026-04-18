import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "lxi-web.theme";

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore storage errors (e.g. Safari private mode)
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

/**
 * Light / dark toggle with localStorage persistence. Initial value respects
 * `prefers-color-scheme`; once the user makes a choice, that choice wins on
 * every subsequent visit.
 */
export const useThemeStore = defineStore("theme", () => {
  const mode = ref<ThemeMode>(initialTheme());

  watch(
    mode,
    (value) => {
      if (typeof window === "undefined") return;
      const root = window.document.documentElement;
      root.classList.toggle("dark", value === "dark");
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
    },
    { immediate: true },
  );

  function toggle(): void {
    mode.value = mode.value === "dark" ? "light" : "dark";
  }

  return { mode, toggle };
});
