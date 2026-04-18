import test from "node:test";
import assert from "node:assert/strict";
import {
  BENCH_DMM_VARIANTS,
  CALIBRATOR_VARIANTS,
  FlukeBenchDmm,
  FlukeCalibrator,
  createDefaultRegistry,
  parseIdn,
  refineBenchDmmProfile,
} from "../src/index.js";
import type { ScpiPort } from "../src/scpi/port.js";

function fakePort(): ScpiPort {
  return {
    async query(): Promise<string> {
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
}

function flukeIdn(
  model: string,
  vendor = "FLUKE",
): ReturnType<typeof parseIdn> {
  return parseIdn(`${vendor},${model},SN,FW`);
}

// ---- registry <-> variant table round-trip ----

test("every Fluke bench-DMM variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of BENCH_DMM_VARIANTS) {
    const entry = registry.resolve(flukeIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `fluke-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "multimeter");
    const dmm = entry!.create(fakePort(), flukeIdn(variant.variant)) as FlukeBenchDmm;
    assert.equal(dmm.profile.variant, variant.variant);
    assert.equal(dmm.profile.digits, variant.digits);
  }
});

test("every Fluke calibrator variant resolves through the PSU façade", () => {
  const registry = createDefaultRegistry();
  for (const variant of CALIBRATOR_VARIANTS) {
    const entry = registry.resolve(flukeIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `fluke-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    const cal = entry!.create(fakePort(), flukeIdn(variant.variant)) as FlukeCalibrator;
    assert.equal(cal.profile.variant, variant.variant);
  }
});

// ---- manufacturer pattern tolerance ----

test("Fluke manufacturer regex matches FLUKE / Fluke / fluke spellings", () => {
  const registry = createDefaultRegistry();
  assert.ok(registry.resolve(parseIdn("FLUKE,8845A,SN,FW")));
  assert.ok(registry.resolve(parseIdn("Fluke,8845A,SN,FW")));
  assert.ok(registry.resolve(parseIdn("Fluke Corporation,8845A,SN,FW")));
});

// ---- catch-all routing ----

test("catch-all Fluke bench-DMM entry routes unseen 88xxA / 85xxA suffixes", () => {
  const registry = createDefaultRegistry();
  for (const model of ["8860A", "8500A"]) {
    const entry = registry.resolve(flukeIdn(model));
    assert.ok(entry, `${model} must resolve via the bench-DMM catch-all`);
    assert.equal(entry!.kind, "multimeter");
  }
});

test("catch-all Fluke calibrator entry routes unseen 55xxA / 57xxA suffixes", () => {
  const registry = createDefaultRegistry();
  for (const model of ["5540A", "5790A"]) {
    const entry = registry.resolve(flukeIdn(model));
    assert.ok(entry, `${model} must resolve via the calibrator catch-all`);
    assert.equal(entry!.kind, "powerSupply");
  }
});

// ---- per-variant feature gating ----

test("8808A has no dual-display capability on the driver surface", () => {
  const variant = BENCH_DMM_VARIANTS.find((v) => v.variant === "8808A")!;
  const dmm = new FlukeBenchDmm(fakePort(), flukeIdn("8808A"), variant);
  assert.equal(dmm.dualDisplay, undefined);
});

test("8845A / 8846A expose dual-display pairs over voltage + current", () => {
  for (const model of ["8845A", "8846A"]) {
    const variant = BENCH_DMM_VARIANTS.find((v) => v.variant === model)!;
    const dmm = new FlukeBenchDmm(fakePort(), flukeIdn(model), variant);
    assert.ok(dmm.dualDisplay, `${model} should advertise dual-display`);
  }
});

test("metrology variants (8508A / 8588A) carry the needsCrlf hint", () => {
  for (const model of ["8508A", "8588A"]) {
    const variant = BENCH_DMM_VARIANTS.find((v) => v.variant === model)!;
    assert.equal(variant.needsCrlf, true, `${model} must request CR+LF`);
  }
});

// ---- refine() behaviour ----

test("refineBenchDmmProfile widens math + dual-display when *OPT? advertises options", async () => {
  const base = BENCH_DMM_VARIANTS.find((v) => v.variant === "8808A")!;
  assert.equal(base.hasDualDisplay, false);
  const port: ScpiPort = {
    async query(cmd: string): Promise<string> {
      if (/OPT/i.test(cmd)) return "DUAL,MATH";
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineBenchDmmProfile(base, port);
  assert.equal(refined.hasDualDisplay, true);
  assert.ok(refined.mathFunctions.includes("stats"));
  assert.ok(refined.mathFunctions.includes("limit"));
});

test("refineBenchDmmProfile preserves base when *OPT? throws -113", async () => {
  const base = BENCH_DMM_VARIANTS[0]!;
  const port: ScpiPort = {
    async query(): Promise<string> {
      throw new Error("-113 Undefined header");
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineBenchDmmProfile(base, port);
  assert.equal(refined.variant, base.variant);
  assert.equal(refined.hasDualDisplay, base.hasDualDisplay);
});

test("FlukeCalibrator rejects channels other than 1", async () => {
  const variant = CALIBRATOR_VARIANTS[0]!;
  const cal = new FlukeCalibrator(fakePort(), flukeIdn(variant.variant), variant);
  await assert.rejects(() => cal.setChannelVoltage(2, 10));
});

test("FlukeCalibrator clamps setpoints to profile limits", async () => {
  const variant = CALIBRATOR_VARIANTS[0]!;
  const writes: string[] = [];
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(cmd: string): Promise<void> {
      writes.push(cmd);
    },
    async writeBinary(): Promise<void> {},
  };
  const cal = new FlukeCalibrator(port, flukeIdn(variant.variant), variant);
  await cal.setChannelVoltage(1, variant.voltageMaxDc * 2);
  assert.ok(writes.some((w) => w.startsWith(`OUT ${variant.voltageMaxDc},V`)));
});
