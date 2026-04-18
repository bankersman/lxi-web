import type { ScpiPort } from "../scpi/port.js";
import type { DeviceIdentity } from "./idn.js";
import type { DeviceKind } from "./kind.js";

export type Pattern = string | RegExp;

export interface DriverMatcher {
  readonly manufacturer: Pattern;
  readonly model: Pattern;
}

/**
 * Factory bound to one driver pattern. Returning `unknown` at the type level
 * keeps the registry a single flat list; callers narrow on `kind` (via the
 * returned entry) and cast to the matching facade interface.
 */
export interface DriverEntry {
  readonly id: string;
  readonly kind: Exclude<DeviceKind, "unknown">;
  readonly match: DriverMatcher;
  readonly create: (port: ScpiPort, identity: DeviceIdentity) => unknown;
}

export class DriverRegistry {
  readonly #entries: DriverEntry[] = [];

  register(entry: DriverEntry): void {
    if (this.#entries.some((e) => e.id === entry.id)) {
      throw new Error(`driver id "${entry.id}" already registered`);
    }
    this.#entries.push(entry);
  }

  /** All registered drivers, most-recently-registered last. */
  list(): readonly DriverEntry[] {
    return this.#entries;
  }

  /** First registered entry whose matcher accepts the identity, else null. */
  resolve(identity: DeviceIdentity): DriverEntry | null {
    for (const entry of this.#entries) {
      if (
        matches(identity.manufacturer, entry.match.manufacturer) &&
        matches(identity.model, entry.match.model)
      ) {
        return entry;
      }
    }
    return null;
  }
}

function matches(value: string, pattern: Pattern): boolean {
  if (pattern instanceof RegExp) return pattern.test(value);
  return value.toLowerCase().includes(pattern.toLowerCase());
}
