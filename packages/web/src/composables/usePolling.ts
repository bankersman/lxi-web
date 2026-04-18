import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

export interface PollingOptions {
  /** Interval in milliseconds between poll attempts. */
  readonly intervalMs: number;
  /** When `false`, stop polling. Useful for pausing while disconnected. */
  readonly enabled?: Ref<boolean>;
  /** Fire immediately on mount. Defaults to `true`. */
  readonly immediate?: boolean;
}

/**
 * Invokes `task` on a fixed cadence while the component is mounted. Skips an
 * iteration if the previous one is still in flight so we never stack requests
 * on a slow instrument. Errors bubble through `error` so the caller can surface
 * them in an `aria-live` region.
 */
export function usePolling<T>(
  task: () => Promise<T>,
  options: PollingOptions,
): {
  readonly data: Ref<T | null>;
  readonly error: Ref<string | null>;
  readonly inflight: Ref<boolean>;
  refresh(): Promise<void>;
} {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<string | null>(null);
  const inflight = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh(): Promise<void> {
    if (inflight.value) return;
    inflight.value = true;
    try {
      data.value = await task();
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      inflight.value = false;
    }
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => void refresh(), options.intervalMs);
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  onMounted(() => {
    if (options.immediate !== false) void refresh();
    if (!options.enabled || options.enabled.value) start();
  });

  if (options.enabled) {
    watch(options.enabled, (on) => {
      if (on) {
        void refresh();
        start();
      } else {
        stop();
      }
    });
  }

  onBeforeUnmount(stop);

  return { data, error, inflight, refresh };
}
