import test from "node:test";
import assert from "node:assert/strict";
import {
  E36_VARIANTS,
  TRUEVOLT_VARIANTS,
  INFINIIVISION_VARIANTS,
  EL3_VARIANTS,
  T33500B_VARIANTS,
  KeysightE36,
  KeysightTrueVolt,
  KeysightInfiniiVision,
  KeysightEl3,
  KeysightTrueform33500,
  createDefaultRegistry,
  parseIdn,
  refineInfiniiVisionProfile,
  refineE36Profile,
  refineTrueVoltProfile,
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

function keysightIdn(model: string): ReturnType<typeof parseIdn> {
  return parseIdn(`Keysight Technologies,${model},SN,FW`);
}

function agilentIdn(model: string): ReturnType<typeof parseIdn> {
  return parseIdn(`Agilent Technologies,${model},SN,FW`);
}

// ---- registry <-> variant table round-trip ----

test("every E36 variant resolves to its per-SKU registry entry with correct channel layout", () => {
  const registry = createDefaultRegistry();
  for (const variant of E36_VARIANTS) {
    const entry = registry.resolve(keysightIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `keysight-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    const psu = entry!.create(fakePort(), keysightIdn(variant.variant)) as KeysightE36;
    assert.equal(psu.profile.variant, variant.variant);
    assert.equal(psu.profile.channels.length, variant.channels.length);
  }
});

test("every Truevolt variant resolves to its per-SKU registry entry with correct modes", () => {
  const registry = createDefaultRegistry();
  for (const variant of TRUEVOLT_VARIANTS) {
    const entry = registry.resolve(keysightIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `keysight-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "multimeter");
    const dmm = entry!.create(fakePort(), keysightIdn(variant.variant)) as KeysightTrueVolt;
    assert.equal(dmm.profile.variant, variant.variant);
    assert.deepEqual(dmm.supportedModes, variant.modes);
  }
});

test("every InfiniiVision variant resolves to its per-SKU registry entry with correct bandwidth", () => {
  const registry = createDefaultRegistry();
  for (const variant of INFINIIVISION_VARIANTS) {
    const entry = registry.resolve(keysightIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `keysight-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), keysightIdn(variant.variant)) as KeysightInfiniiVision;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.bandwidthMhz, variant.bandwidthMhz);
    assert.equal(scope.profile.channels, variant.channels);
  }
});

test("every EL3 variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of EL3_VARIANTS) {
    const entry = registry.resolve(keysightIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `keysight-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "electronicLoad");
    const eload = entry!.create(fakePort(), keysightIdn(variant.variant)) as KeysightEl3;
    assert.equal(eload.profile.variant, variant.variant);
    assert.equal(eload.profile.powerMax, variant.powerMax);
  }
});

test("every Trueform 33500/33600 variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of T33500B_VARIANTS) {
    const entry = registry.resolve(keysightIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `keysight-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "signalGenerator");
    const sg = entry!.create(fakePort(), keysightIdn(variant.variant)) as KeysightTrueform33500;
    assert.equal(sg.profile.variant, variant.variant);
    assert.equal(sg.profile.channelCount, variant.channelCount);
  }
});

// ---- InfiniiVision IDN-format tolerance ----

test("InfiniiVision resolver accepts the 'DSO-X 2024A' firmware spelling", () => {
  const registry = createDefaultRegistry();
  const spaced = parseIdn("Keysight Technologies,DSO-X 2024A,SN,FW");
  const entry = registry.resolve(spaced);
  assert.ok(entry);
  assert.equal(entry!.id, "keysight-dsox2024a");
});

test("InfiniiVision resolver accepts the 'MSO-X 3034T' MSO firmware spelling", () => {
  const registry = createDefaultRegistry();
  const spaced = parseIdn("Keysight Technologies,MSO-X 3034T,SN,FW");
  const entry = registry.resolve(spaced);
  assert.ok(entry);
  assert.equal(entry!.id, "keysight-msox3034t");
});

// ---- catch-all profile defaults ----

test("catch-all E36 entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(keysightIdn("E36999Z"));
  assert.ok(entry);
  assert.equal(entry!.kind, "powerSupply");
  const psu = entry!.create(fakePort(), keysightIdn("E36999Z")) as KeysightE36;
  assert.equal(psu.profile.variant, "E36xxx");
});

test("catch-all Truevolt entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  // Any 344xxA family model the variant table doesn't enumerate.
  const entry = registry.resolve(keysightIdn("34499A"));
  assert.ok(entry);
  assert.equal(entry!.kind, "multimeter");
  const dmm = entry!.create(fakePort(), keysightIdn("34499A")) as KeysightTrueVolt;
  assert.equal(dmm.profile.variant, "34xxxA");
});

// ---- manufacturer pattern tolerance ----

test("driver registry matches both 'Keysight' and legacy 'Agilent Technologies'", () => {
  const registry = createDefaultRegistry();
  // The E36311A has existed in both eras; pre-2014 Agilent-branded
  // firmware still appears on refurbished units.
  const keysight = keysightIdn("E36311A");
  const agilent = agilentIdn("E36311A");
  const kEntry = registry.resolve(keysight);
  const aEntry = registry.resolve(agilent);
  assert.ok(kEntry);
  assert.ok(aEntry);
  assert.equal(kEntry!.id, aEntry!.id);
});

test("driver registry case-insensitively matches 'KEYSIGHT TECHNOLOGIES'", () => {
  const registry = createDefaultRegistry();
  const shouty = parseIdn("KEYSIGHT TECHNOLOGIES,34461A,SN,FW");
  assert.ok(registry.resolve(shouty));
});

// ---- refine() behaviour ----

test("refineInfiniiVisionProfile narrows decoder protocols based on *OPT? licenses", async () => {
  const base = INFINIIVISION_VARIANTS.find((v) => v.variant === "DSOX3034T");
  assert.ok(base);
  const port: ScpiPort = {
    async query(command: string): Promise<string> {
      if (command === "*OPT?") return "DSOXBW3-350,CAN,I2C";
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineInfiniiVisionProfile(base!, port);
  assert.deepEqual([...refined.decoderProtocols].sort(), ["can", "i2c"].sort());
});

test("refineInfiniiVisionProfile keeps the full decoder set when *OPT? is empty", async () => {
  const base = INFINIIVISION_VARIANTS.find((v) => v.variant === "DSOX3034T");
  assert.ok(base);
  const port: ScpiPort = {
    async query(command: string): Promise<string> {
      if (command === "*OPT?") return "0";
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineInfiniiVisionProfile(base!, port);
  assert.deepEqual(
    [...refined.decoderProtocols].sort(),
    [...base!.decoderProtocols].sort(),
  );
});

test("refineE36Profile preserves the base profile (4.7 is observational)", async () => {
  const base = E36_VARIANTS.find((v) => v.variant === "EDU36311A");
  assert.ok(base);
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "0";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineE36Profile(base!, port);
  assert.equal(refined.variant, base!.variant);
  assert.equal(refined.channels.length, base!.channels.length);
});

test("refineTrueVoltProfile preserves the base profile (4.7 is observational)", async () => {
  const base = TRUEVOLT_VARIANTS.find((v) => v.variant === "34461A");
  assert.ok(base);
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "DIG,HIST";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineTrueVoltProfile(base!, port);
  assert.equal(refined.variant, base!.variant);
  assert.deepEqual([...refined.modes].sort(), [...base!.modes].sort());
});
