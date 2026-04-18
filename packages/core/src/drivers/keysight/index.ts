import { DriverRegistry } from "../../identity/registry.js";
import { KeysightE36 } from "./e36.js";
import { E36_DEFAULT, E36_VARIANTS, refineE36Profile, type E36Profile } from "./e36-profile.js";
import { KeysightTrueVolt } from "./truevolt.js";
import {
  TRUEVOLT_DEFAULT,
  TRUEVOLT_VARIANTS,
  refineTrueVoltProfile,
  type TrueVoltProfile,
} from "./truevolt-profile.js";
import { KeysightInfiniiVision } from "./infiniivision.js";
import {
  INFINIIVISION_DEFAULT,
  INFINIIVISION_VARIANTS,
  refineInfiniiVisionProfile,
  type InfiniiVisionProfile,
} from "./infiniivision-profile.js";
import { KeysightEl3 } from "./el3.js";
import { EL3_DEFAULT, EL3_VARIANTS, refineEl3Profile, type El3Profile } from "./el3-profile.js";
import { KeysightTrueform33500 } from "./3350x.js";
import {
  T33500_DEFAULT,
  T33500B_VARIANTS,
  refineTrueform33500Profile,
  type Trueform33500Profile,
} from "./3350x-profile.js";

export { KeysightE36 } from "./e36.js";
export { KeysightTrueVolt } from "./truevolt.js";
export { KeysightInfiniiVision } from "./infiniivision.js";
export { KeysightEl3 } from "./el3.js";
export { KeysightTrueform33500 } from "./3350x.js";

export type {
  E36Profile,
  TrueVoltProfile,
  InfiniiVisionProfile,
  El3Profile,
  Trueform33500Profile,
};
export {
  E36_VARIANTS,
  E36_DEFAULT,
  TRUEVOLT_VARIANTS,
  TRUEVOLT_DEFAULT,
  INFINIIVISION_VARIANTS,
  INFINIIVISION_DEFAULT,
  EL3_VARIANTS,
  EL3_DEFAULT,
  T33500B_VARIANTS,
  T33500_DEFAULT,
  refineE36Profile,
  refineTrueVoltProfile,
  refineInfiniiVisionProfile,
  refineEl3Profile,
  refineTrueform33500Profile,
};

/**
 * Keysight / legacy Agilent manufacturer pattern. Keysight rebranded
 * the T&M division in 2014; pre-2014 firmware still advertises
 * "Agilent Technologies" on IDN. A single regex catches both so the
 * resolver doesn't care which rebrand state a given bench is in.
 *
 * The character class inside the alternation intentionally matches
 * the trailing `TECHNOLOGIES` token on the Agilent side so we don't
 * accidentally absorb the generic word "Agilent" appearing elsewhere.
 */
const KEYSIGHT_MANUFACTURER = /keysight|agilent technologies/i;

/**
 * Sort variants longest-name first so specific SKUs (e.g. `EDU36311A`)
 * take precedence over broader regex prefixes (`E36311A`). Same shape
 * as the Siglent helper — the registry is first-match-wins, so
 * ordering matters when multiple variant regexes could match one IDN.
 */
function sortedByLength<T extends { readonly variant: string }>(variants: readonly T[]): T[] {
  return [...variants].sort((a, b) => b.variant.length - a.variant.length);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a model regex for an InfiniiVision variant like `DSOX2024A`.
 * Real Keysight firmware advertises the model as `DSO-X 2024A` or
 * `MSO-X 3034T` with a dash and space; older firmwares drop the space
 * and some condensed lists drop both. Tolerate all three spellings.
 */
function infiniiVisionModelRegex(variant: string): RegExp {
  const m = variant.match(/^(DSO|MSO)X(\d{4}[A-Z])$/);
  if (!m) return new RegExp(`^${escapeRegex(variant)}\\b`, "i");
  const prefix = m[1]!;
  const rest = m[2]!;
  return new RegExp(`^${prefix}-?X\\s?${escapeRegex(rest)}\\b`, "i");
}

export function registerKeysightDrivers(registry: DriverRegistry): void {
  // ---- E36 PSU family ----
  for (const variant of sortedByLength(E36_VARIANTS)) {
    registry.register({
      id: `keysight-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: {
        manufacturer: KEYSIGHT_MANUFACTURER,
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new KeysightE36(port, identity, variant),
      refine: async (port) => {
        const refined = await refineE36Profile(variant, port);
        return (p, i) => new KeysightE36(p, i, refined);
      },
    });
  }
  registry.register({
    id: "keysight-e36",
    kind: "powerSupply",
    match: { manufacturer: KEYSIGHT_MANUFACTURER, model: /^(?:EDU)?E?36\d{3}[A-Z]/i },
    create: (port, identity) => new KeysightE36(port, identity, E36_DEFAULT),
    refine: async (port) => {
      const refined = await refineE36Profile(E36_DEFAULT, port);
      return (p, i) => new KeysightE36(p, i, refined);
    },
  });
  registry.register({
    id: "keysight-e364x",
    kind: "powerSupply",
    match: { manufacturer: KEYSIGHT_MANUFACTURER, model: /^E364\d[A-Z]/i },
    create: (port, identity) => new KeysightE36(port, identity, E36_DEFAULT),
    refine: async (port) => {
      const refined = await refineE36Profile(E36_DEFAULT, port);
      return (p, i) => new KeysightE36(p, i, refined);
    },
  });

  // ---- Truevolt DMM family ----
  for (const variant of sortedByLength(TRUEVOLT_VARIANTS)) {
    registry.register({
      id: `keysight-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: {
        manufacturer: KEYSIGHT_MANUFACTURER,
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new KeysightTrueVolt(port, identity, variant),
      refine: async (port) => {
        const refined = await refineTrueVoltProfile(variant, port);
        return (p, i) => new KeysightTrueVolt(p, i, refined);
      },
    });
  }
  registry.register({
    id: "keysight-truevolt",
    kind: "multimeter",
    match: { manufacturer: KEYSIGHT_MANUFACTURER, model: /^344\d{2}A/i },
    create: (port, identity) => new KeysightTrueVolt(port, identity, TRUEVOLT_DEFAULT),
    refine: async (port) => {
      const refined = await refineTrueVoltProfile(TRUEVOLT_DEFAULT, port);
      return (p, i) => new KeysightTrueVolt(p, i, refined);
    },
  });

  // ---- InfiniiVision scope family ----
  for (const variant of sortedByLength(INFINIIVISION_VARIANTS)) {
    registry.register({
      id: `keysight-${variant.variant.toLowerCase()}`,
      kind: "oscilloscope",
      match: {
        manufacturer: KEYSIGHT_MANUFACTURER,
        model: infiniiVisionModelRegex(variant.variant),
      },
      create: (port, identity) => new KeysightInfiniiVision(port, identity, variant),
      refine: async (port) => {
        const refined = await refineInfiniiVisionProfile(variant, port);
        return (p, i) => new KeysightInfiniiVision(p, i, refined);
      },
    });
  }
  registry.register({
    id: "keysight-infiniivision",
    kind: "oscilloscope",
    // Catch-all accepts the condensed + dashed/spaced spellings.
    match: {
      manufacturer: KEYSIGHT_MANUFACTURER,
      model: /^(?:DSO|MSO)-?X\s?\d{4}[ATG]/i,
    },
    create: (port, identity) => new KeysightInfiniiVision(port, identity, INFINIIVISION_DEFAULT),
    refine: async (port) => {
      const refined = await refineInfiniiVisionProfile(INFINIIVISION_DEFAULT, port);
      return (p, i) => new KeysightInfiniiVision(p, i, refined);
    },
  });

  // ---- EL3 electronic-load family ----
  for (const variant of sortedByLength(EL3_VARIANTS)) {
    registry.register({
      id: `keysight-${variant.variant.toLowerCase()}`,
      kind: "electronicLoad",
      match: {
        manufacturer: KEYSIGHT_MANUFACTURER,
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new KeysightEl3(port, identity, variant),
      refine: async (port) => {
        const refined = await refineEl3Profile(variant, port);
        return (p, i) => new KeysightEl3(p, i, refined);
      },
    });
  }
  registry.register({
    id: "keysight-el3",
    kind: "electronicLoad",
    match: { manufacturer: KEYSIGHT_MANUFACTURER, model: /^EL3\d{4}A/i },
    create: (port, identity) => new KeysightEl3(port, identity, EL3_DEFAULT),
    refine: async (port) => {
      const refined = await refineEl3Profile(EL3_DEFAULT, port);
      return (p, i) => new KeysightEl3(p, i, refined);
    },
  });

  // ---- Trueform 33500B / 33600A signal-generator family ----
  for (const variant of sortedByLength(T33500B_VARIANTS)) {
    registry.register({
      id: `keysight-${variant.variant.toLowerCase()}`,
      kind: "signalGenerator",
      match: {
        manufacturer: KEYSIGHT_MANUFACTURER,
        model: new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i"),
      },
      create: (port, identity) => new KeysightTrueform33500(port, identity, variant),
      refine: async (port) => {
        const refined = await refineTrueform33500Profile(variant, port);
        return (p, i) => new KeysightTrueform33500(p, i, refined);
      },
    });
  }
  registry.register({
    id: "keysight-33500b",
    kind: "signalGenerator",
    match: { manufacturer: KEYSIGHT_MANUFACTURER, model: /^335\d{2}B/i },
    create: (port, identity) => new KeysightTrueform33500(port, identity, T33500_DEFAULT),
    refine: async (port) => {
      const refined = await refineTrueform33500Profile(T33500_DEFAULT, port);
      return (p, i) => new KeysightTrueform33500(p, i, refined);
    },
  });
  registry.register({
    id: "keysight-33600a",
    kind: "signalGenerator",
    match: { manufacturer: KEYSIGHT_MANUFACTURER, model: /^336\d{2}A/i },
    create: (port, identity) => new KeysightTrueform33500(port, identity, T33500_DEFAULT),
    refine: async (port) => {
      const refined = await refineTrueform33500Profile(T33500_DEFAULT, port);
      return (p, i) => new KeysightTrueform33500(p, i, refined);
    },
  });
}
