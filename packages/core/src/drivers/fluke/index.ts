import { DriverRegistry } from "../../identity/registry.js";
import { FLUKE_MANUFACTURER } from "./_shared/index.js";
import { FlukeBenchDmm } from "./bench-dmm.js";
import {
  BENCH_DMM_DEFAULT,
  BENCH_DMM_VARIANTS,
  refineBenchDmmProfile,
  type BenchDmmProfile,
} from "./bench-dmm-profile.js";
import { FlukeCalibrator } from "./calibrator.js";
import {
  CALIBRATOR_DEFAULT,
  CALIBRATOR_VARIANTS,
  refineCalibratorProfile,
  type FlukeCalibratorProfile,
} from "./calibrator-profile.js";

export { FlukeBenchDmm } from "./bench-dmm.js";
export { FlukeCalibrator } from "./calibrator.js";
export { FLUKE_MANUFACTURER } from "./_shared/index.js";

export type { BenchDmmProfile, FlukeCalibratorProfile };
export {
  BENCH_DMM_VARIANTS,
  BENCH_DMM_DEFAULT,
  refineBenchDmmProfile,
  CALIBRATOR_VARIANTS,
  CALIBRATOR_DEFAULT,
  refineCalibratorProfile,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortedByLength<T extends { readonly variant: string }>(
  variants: readonly T[],
): T[] {
  return [...variants].sort((a, b) => b.variant.length - a.variant.length);
}

/**
 * Register every Fluke driver. Per-SKU variants come first
 * (longest-name-first) followed by the family catch-alls. The Fluke
 * pack is intentionally narrow — no scopes, no AWGs, no SAs.
 *
 * Manufacturer regex: `FLUKE_MANUFACTURER` (`/fluke/i`). Fluke firmware
 * varies between `FLUKE, 8845A` and `Fluke Corporation`; both forms
 * normalise through the shared `parseIdn` machinery.
 */
export function registerFlukeDrivers(registry: DriverRegistry): void {
  // ---- Bench DMMs (8000 / 8800 / 8500) ----
  for (const variant of sortedByLength(BENCH_DMM_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `fluke-${variant.variant.toLowerCase()}`,
      kind: "multimeter",
      match: { manufacturer: FLUKE_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new FlukeBenchDmm(port, identity, variant),
      refine: async (port) => {
        const refined = await refineBenchDmmProfile(variant, port);
        return (p, i) => new FlukeBenchDmm(p, i, refined);
      },
    });
  }
  registry.register({
    id: "fluke-bench-dmm",
    kind: "multimeter",
    match: {
      manufacturer: FLUKE_MANUFACTURER,
      model: /^(88\d{2}A|85\d{2}A)\b/i,
    },
    create: (port, identity) => new FlukeBenchDmm(port, identity, BENCH_DMM_DEFAULT),
    refine: async (port) => {
      const refined = await refineBenchDmmProfile(BENCH_DMM_DEFAULT, port);
      return (p, i) => new FlukeBenchDmm(p, i, refined);
    },
  });

  // ---- Multi-function calibrators (55xx / 57xx) ----
  for (const variant of sortedByLength(CALIBRATOR_VARIANTS)) {
    const modelPattern = new RegExp(`^${escapeRegex(variant.variant)}\\b`, "i");
    registry.register({
      id: `fluke-${variant.variant.toLowerCase()}`,
      kind: "powerSupply",
      match: { manufacturer: FLUKE_MANUFACTURER, model: modelPattern },
      create: (port, identity) => new FlukeCalibrator(port, identity, variant),
      refine: async (port) => {
        const refined = await refineCalibratorProfile(variant, port);
        return (p, i) => new FlukeCalibrator(p, i, refined);
      },
    });
  }
  registry.register({
    id: "fluke-calibrator",
    kind: "powerSupply",
    match: {
      manufacturer: FLUKE_MANUFACTURER,
      // 5520A / 5522A / 5730A + related 55xx/57xx SKUs. Excludes
      // ScopeMeter handhelds (`19x`) and 45-series DMMs.
      model: /^(55\d{2}A|57\d{2}A)\b/i,
    },
    create: (port, identity) => new FlukeCalibrator(port, identity, CALIBRATOR_DEFAULT),
    refine: async (port) => {
      const refined = await refineCalibratorProfile(CALIBRATOR_DEFAULT, port);
      return (p, i) => new FlukeCalibrator(p, i, refined);
    },
  });
}
