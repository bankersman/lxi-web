import { onBeforeUnmount, onMounted } from "vue";
import { useSafeModeStore } from "@/stores/safeMode";

function isTextInputTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * `g` then `s` toggles safe mode (Epic 5.3 placeholder until Epic 6.1 shortcut engine).
 */
export function useSafeModeHotkey(): void {
  const safe = useSafeModeStore();
  let lastG = 0;
  const windowMs = 900;

  function onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTextInputTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === "g") {
      lastG = Date.now();
      return;
    }
    if (k === "s" && Date.now() - lastG < windowMs) {
      e.preventDefault();
      safe.toggle();
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
}
