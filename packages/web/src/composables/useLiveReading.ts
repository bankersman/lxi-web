import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { ReadingTopic } from "@lxi-web/core/browser";
import { useSessionsStore } from "@/stores/sessions";

export interface LiveReadingOptions {
  /**
   * When `false`, the subscription is released. Flipping it back to `true`
   * re-subscribes. Useful for conditional feeds (e.g. DMM dual display is
   * only active when a secondary mode is configured).
   */
  readonly enabled?: Ref<boolean>;
}

/**
 * Subscribe to a server-pushed reading topic for the lifetime of the calling
 * component. Replaces `usePolling` for topics that stream over WebSocket.
 *
 * Multiple mounted components may subscribe to the same `(sessionId, topic)`
 * pair simultaneously — the sessions store dedupes these into a single
 * server-side feed, so a DMM detail page and its dashboard mini tile share
 * one instrument poll instead of racing each other.
 */
export function useLiveReading<T>(
  sessionId: () => string,
  topic: ReadingTopic,
  options: LiveReadingOptions = {},
): {
  readonly data: Ref<T | null>;
  readonly error: Ref<string | null>;
  readonly measuredAt: Ref<number | null>;
} {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<string | null>(null);
  const measuredAt = ref<number | null>(null);

  const sessions = useSessionsStore();
  let unsubscribe: (() => void) | null = null;

  const listener = {
    onUpdate(payload: unknown, ts: number): void {
      data.value = payload as T;
      measuredAt.value = ts;
      error.value = null;
    },
    onError(message: string, _at: number): void {
      error.value = message;
    },
  };

  function attach(): void {
    if (unsubscribe) return;
    unsubscribe = sessions.subscribeTopic(sessionId(), topic, listener);
  }
  function detach(): void {
    if (!unsubscribe) return;
    unsubscribe();
    unsubscribe = null;
  }

  if (options.enabled) {
    watch(
      options.enabled,
      (on) => {
        if (on) attach();
        else detach();
      },
      { immediate: true },
    );
  } else {
    attach();
  }

  onBeforeUnmount(detach);

  return { data, error, measuredAt };
}
