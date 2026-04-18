import { computed, type ComputedRef } from "vue";
import { mergeWriteGate } from "@/lib/safeModeWriteBind";
import { useSafeModeStore } from "@/stores/safeMode";

export function useSafeModeGate(): {
  readonly enabled: ComputedRef<boolean>;
  readonly attrs: ComputedRef<{
    disabled: boolean;
    "aria-disabled": boolean;
    title: string; // empty when safe mode off
  }>;
  /** Per-control merge of local `disabled` with safe mode (preferred for panels). */
  bindWrite(getOwnDisabled: () => boolean): ComputedRef<ReturnType<typeof mergeWriteGate>>;
} {
  const safe = useSafeModeStore();
  const enabled = computed(() => safe.enabled);
  const attrs = computed(() => mergeWriteGate(false, safe.enabled));
  function bindWrite(getOwnDisabled: () => boolean) {
    return computed(() => mergeWriteGate(getOwnDisabled(), safe.enabled));
  }
  return { enabled, attrs, bindWrite };
}
