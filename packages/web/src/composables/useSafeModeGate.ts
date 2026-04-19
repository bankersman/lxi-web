import { computed, reactive, type ComputedRef } from "vue";
import { mergeWriteGate } from "@/lib/safeModeWriteBind";
import { useSafeModeStore } from "@/stores/safeMode";

/**
 * Return a reactive gate object so `gate.enabled` unwraps in templates and script.
 * A plain `{ enabled: ComputedRef }` does not auto-unwrap nested refs on property access,
 * so `:disabled="... || gate.enabled"` was always truthy outside `<script>` top-level refs.
 */
export function useSafeModeGate(): {
  readonly enabled: boolean;
  readonly attrs: {
    disabled: boolean;
    "aria-disabled": boolean;
    title: string;
  };
  bindWrite(getOwnDisabled: () => boolean): ComputedRef<ReturnType<typeof mergeWriteGate>>;
} {
  const safe = useSafeModeStore();
  return reactive({
    enabled: computed(() => safe.enabled),
    attrs: computed(() => mergeWriteGate(false, safe.enabled)),
    bindWrite(getOwnDisabled: () => boolean) {
      return computed(() => mergeWriteGate(getOwnDisabled(), safe.enabled));
    },
  });
}
