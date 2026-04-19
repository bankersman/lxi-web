import test from "node:test";
import assert from "node:assert/strict";
import {
  DHO800_VARIANTS,
  DM800_VARIANTS,
  DP900_VARIANTS,
  RigolDho800,
  RigolDm800,
  RigolDp900,
  createDefaultRegistry,
  parseIdn,
  refineDho800Profile,
  refineDm800Profile,
  refineDp900Profile,
} from "../src/index.js";
import type { ScpiPort } from "../src/scpi/port.js";

// ---- registry <-> variant table round-trip ----

test("every DHO800 variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of DHO800_VARIANTS) {
    const entry = registry.resolve(
      parseIdn(`RIGOL TECHNOLOGIES,${variant.variant},SN,FW`),
    );
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `rigol-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), parseIdn("RIGOL,X,SN,FW")) as RigolDho800;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.channels, variant.channels);
    assert.equal(scope.profile.bandwidthMhz, variant.bandwidthMhz);
    assert.equal(scope.decoders.buses, variant.decoderBuses);
  }
});

test("every DP900 variant resolves to its per-SKU registry entry with correct limits", () => {
  const registry = createDefaultRegistry();
  for (const variant of DP900_VARIANTS) {
    const entry = registry.resolve(
      parseIdn(`RIGOL TECHNOLOGIES,${variant.variant},SN,FW`),
    );
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `rigol-${variant.variant.toLowerCase()}`);
    const psu = entry!.create(fakePort(), parseIdn("RIGOL,X,SN,FW")) as RigolDp900;
    assert.equal(psu.profile.variant, variant.variant);
    assert.equal(psu.profile.channels.length, variant.channels.length);
    const ch1 = variant.channels.find((c) => c.id === 1);
    if (ch1) {
      assert.equal(psu.profile.channels[0]?.voltageMax, ch1.voltageMax);
    }
  }
});

test("every DM800 variant resolves to its per-SKU registry entry with correct modes", () => {
  const registry = createDefaultRegistry();
  for (const variant of DM800_VARIANTS) {
    const entry = registry.resolve(
      parseIdn(`RIGOL TECHNOLOGIES,${variant.variant},SN,FW`),
    );
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `rigol-${variant.variant.toLowerCase()}`);
    const dmm = entry!.create(fakePort(), parseIdn("RIGOL,X,SN,FW")) as RigolDm800;
    assert.equal(dmm.profile.variant, variant.variant);
    assert.deepEqual(dmm.supportedModes, variant.modes);
  }
});

// ---- refine() behaviour ----

test("refineDho800Profile narrows decoder protocols based on *OPT? licenses", async () => {
  const base = DHO800_VARIANTS.find((v) => v.variant === "DHO804");
  assert.ok(base);
  const port = makeOptPort("SD-IIC,SD-SPI,0");
  const refined = await refineDho800Profile(base!, port);
  assert.deepEqual([...refined.decoderProtocols].sort(), ["i2c", "spi"].sort());
});

test("refineDho800Profile keeps full decoder set when *OPT? is empty", async () => {
  const base = DHO800_VARIANTS.find((v) => v.variant === "DHO804");
  assert.ok(base);
  const port = makeOptPort("0");
  const refined = await refineDho800Profile(base!, port);
  assert.deepEqual(
    [...refined.decoderProtocols].sort(),
    [...base!.decoderProtocols].sort(),
  );
});

test("refineDp900Profile trims channel count when SYSTem:CHANnel:COUNt? reports fewer", async () => {
  const base = DP900_VARIANTS.find((v) => v.variant === "DP932E");
  assert.ok(base);
  const port: ScpiPort = {
    async query(command: string): Promise<string> {
      if (command === ":SYSTem:CHANnel:COUNt?") return "2";
      throw new Error(`unexpected query: ${command}`);
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineDp900Profile(base!, port);
  assert.equal(refined.channels.length, 2);
});

test("refineDm800Profile does not query *OPT? and returns base unchanged", async () => {
  const base = DM800_VARIANTS.find((v) => v.variant === "DM858E");
  assert.ok(base);
  const port: ScpiPort = {
    async query(command: string): Promise<string> {
      if (command === "*OPT?") {
        throw new Error("*OPT? must not be sent on DM800 family");
      }
      throw new Error(`unexpected query: ${command}`);
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineDm800Profile(base!, port);
  assert.equal(refined, base);
});

// ---- catch-all profile defaults ----

test("catch-all DHO entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DHO855,SN,FW"));
  assert.ok(entry);
  assert.equal(entry!.id, "rigol-dho800");
  const scope = entry!.create(fakePort(), parseIdn("RIGOL,X,SN,FW")) as RigolDho800;
  assert.equal(scope.profile.variant, "DHO8xx");
});

// ---- helpers ----

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

function makeOptPort(response: string): ScpiPort {
  return {
    async query(command: string): Promise<string> {
      if (command === "*OPT?") return response;
      if (command.startsWith(":CHANnel") && command.endsWith(":DISPlay?")) return "1";
      throw new Error(`unexpected query: ${command}`);
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
}
