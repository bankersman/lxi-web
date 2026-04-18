import test from "node:test";
import assert from "node:assert/strict";
import {
  SPD_VARIANTS,
  SDM_VARIANTS,
  SDS_VARIANTS,
  SDL_VARIANTS,
  SDG_VARIANTS,
  SSA3000X_VARIANTS,
  SiglentSpd,
  SiglentSdm,
  SiglentSdsHd,
  SiglentSdl,
  SiglentSdg,
  SiglentSsa3000x,
  createDefaultRegistry,
  parseIdn,
  refineSpdProfile,
  refineSdsProfile,
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

function identity(model: string): ReturnType<typeof parseIdn> {
  return parseIdn(`Siglent Technologies,${model},SN,FW`);
}

// ---- registry <-> variant table round-trip ----

test("every SPD variant resolves to its per-SKU registry entry with correct limits", () => {
  const registry = createDefaultRegistry();
  for (const variant of SPD_VARIANTS) {
    const entry = registry.resolve(identity(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `siglent-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    const psu = entry!.create(fakePort(), identity(variant.variant)) as SiglentSpd;
    assert.equal(psu.profile.variant, variant.variant);
    assert.equal(psu.profile.channels.length, variant.channels.length);
  }
});

test("every SDM variant resolves to its per-SKU registry entry with correct modes", () => {
  const registry = createDefaultRegistry();
  for (const variant of SDM_VARIANTS) {
    const entry = registry.resolve(identity(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `siglent-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "multimeter");
    const dmm = entry!.create(fakePort(), identity(variant.variant)) as SiglentSdm;
    assert.equal(dmm.profile.variant, variant.variant);
    assert.deepEqual(dmm.supportedModes, variant.modes);
  }
});

test("every SDS variant resolves to its per-SKU registry entry with correct bandwidth", () => {
  const registry = createDefaultRegistry();
  for (const variant of SDS_VARIANTS) {
    const entry = registry.resolve(identity(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `siglent-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), identity(variant.variant)) as SiglentSdsHd;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.bandwidthMhz, variant.bandwidthMhz);
    assert.equal(scope.profile.channels, variant.channels);
  }
});

test("every SDL variant resolves to its per-SKU registry entry with correct limits", () => {
  const registry = createDefaultRegistry();
  for (const variant of SDL_VARIANTS) {
    const entry = registry.resolve(identity(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `siglent-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "electronicLoad");
    const eload = entry!.create(fakePort(), identity(variant.variant)) as SiglentSdl;
    assert.equal(eload.profile.variant, variant.variant);
    assert.equal(eload.profile.powerMax, variant.powerMax);
  }
});

test("every SDG variant resolves to its per-SKU registry entry with correct channel count", () => {
  const registry = createDefaultRegistry();
  for (const variant of SDG_VARIANTS) {
    const entry = registry.resolve(identity(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `siglent-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "signalGenerator");
    const sg = entry!.create(fakePort(), identity(variant.variant)) as SiglentSdg;
    assert.equal(sg.profile.variant, variant.variant);
    assert.equal(sg.profile.channelCount, variant.channelCount);
  }
});

test("every SSA3000X variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of SSA3000X_VARIANTS) {
    const entry = registry.resolve(identity(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `siglent-${variant.variant.toLowerCase()}`);
    const sa = entry!.create(fakePort(), identity(variant.variant)) as SiglentSsa3000x;
    assert.equal(sa.profile.variant, variant.variant);
  }
});

// ---- catch-all profile defaults ----

test("catch-all SPD entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  // Non-variant model name: matches the family regex only.
  const entry = registry.resolve(identity("SPD9999"));
  assert.ok(entry);
  assert.equal(entry!.kind, "powerSupply");
  const psu = entry!.create(fakePort(), identity("SPD9999")) as SiglentSpd;
  assert.equal(psu.profile.variant, "SPD3xxx");
});

test("catch-all SDS entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(identity("SDS9999X-HD"));
  assert.ok(entry);
  assert.equal(entry!.kind, "oscilloscope");
  const scope = entry!.create(fakePort(), identity("SDS9999X-HD")) as SiglentSdsHd;
  assert.equal(scope.profile.variant, "SDSxxxx");
});

// ---- manufacturer pattern tolerance ----

test("driver registry matches both 'Siglent' and 'SIGLENT TECHNOLOGIES' manufacturer strings", () => {
  const registry = createDefaultRegistry();
  const siglent = parseIdn("Siglent,SSA3032X-R,SN,FW");
  const shouty = parseIdn("SIGLENT TECHNOLOGIES CO. LTD.,SSA3032X-R,SN,FW");
  assert.ok(registry.resolve(siglent));
  assert.ok(registry.resolve(shouty));
});

// ---- refine() behaviour ----

test("refineSpdProfile trims channel count when SYSTem:CHANnel:COUNt? reports fewer", async () => {
  const base = SPD_VARIANTS.find((v) => v.variant === "SPD3303X-E");
  assert.ok(base);
  const port: ScpiPort = {
    async query(command: string): Promise<string> {
      if (command === ":SYSTem:CHANnel:COUNt?") return "2";
      if (command === "*OPT?") return "0";
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineSpdProfile(base!, port);
  assert.equal(refined.channels.length, 2);
});

test("refineSpdProfile preserves the base profile when channel count query fails", async () => {
  const base = SPD_VARIANTS.find((v) => v.variant === "SPD3303X-E");
  assert.ok(base);
  const port: ScpiPort = {
    async query(): Promise<string> {
      throw new Error("unsupported");
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineSpdProfile(base!, port);
  assert.equal(refined.channels.length, base!.channels.length);
});

test("refineSdsProfile narrows decoder protocols based on *OPT? licenses", async () => {
  const base = SDS_VARIANTS.find((v) => v.variant === "SDS824X-HD");
  assert.ok(base);
  const port: ScpiPort = {
    async query(command: string): Promise<string> {
      if (command === "*OPT?") return "SDS-I2C,SDS-SPI,0";
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineSdsProfile(base!, port);
  assert.deepEqual([...refined.decoderProtocols].sort(), ["i2c", "spi"].sort());
});

test("refineSdsProfile keeps full decoder set when *OPT? is empty", async () => {
  const base = SDS_VARIANTS.find((v) => v.variant === "SDS824X-HD");
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
  const refined = await refineSdsProfile(base!, port);
  assert.deepEqual(
    [...refined.decoderProtocols].sort(),
    [...base!.decoderProtocols].sort(),
  );
});
