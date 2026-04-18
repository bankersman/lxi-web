import type { SimulatorPersonality } from "./personality.js";

/**
 * Registry of personalities known to the simulator. Keys are personality
 * ids (e.g. `rigol-dho804`). Personalities can be shared across TCP
 * listeners — per-socket state is recreated by the simulator at connect
 * time so the registry entry itself stays immutable.
 */
export class PersonalityRegistry {
  readonly #entries = new Map<string, SimulatorPersonality>();

  register(personality: SimulatorPersonality): void {
    if (this.#entries.has(personality.id)) {
      throw new Error(
        `simulator personality "${personality.id}" is already registered`,
      );
    }
    this.#entries.set(personality.id, personality);
  }

  get(id: string): SimulatorPersonality | undefined {
    return this.#entries.get(id);
  }

  list(): readonly SimulatorPersonality[] {
    return [...this.#entries.values()];
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }
}
