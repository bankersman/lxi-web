type Listener<Args extends unknown[]> = (...args: Args) => void;

/**
 * Tiny typed event emitter. `on` returns an unsubscriber so callers don't
 * have to hold a reference to the listener for cleanup.
 */
export class TypedEmitter<EventMap extends Record<string, unknown[]>> {
  readonly #listeners = new Map<
    keyof EventMap,
    Set<Listener<EventMap[keyof EventMap]>>
  >();

  on<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>,
  ): () => void {
    let bucket = this.#listeners.get(event) as
      | Set<Listener<EventMap[K]>>
      | undefined;
    if (!bucket) {
      bucket = new Set();
      this.#listeners.set(event, bucket as Set<Listener<EventMap[keyof EventMap]>>);
    }
    bucket.add(listener);
    return () => bucket!.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void {
    const bucket = this.#listeners.get(event) as
      | Set<Listener<EventMap[K]>>
      | undefined;
    if (!bucket) return;
    for (const listener of bucket) {
      try {
        listener(...args);
      } catch (err) {
        console.error("event listener threw", err);
      }
    }
  }
}
