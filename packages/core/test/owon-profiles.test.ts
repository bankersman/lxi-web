import test from "node:test";
import assert from "node:assert/strict";
import {
  XDM_VARIANTS,
  SPE_VARIANTS,
  XDS_VARIANTS,
  OwonXdm,
  OwonSpe,
  OwonXds,
  createDefaultRegistry,
  parseIdn,
  refineXdmProfile,
  refineSpeProfile,
  refineXdsProfile,
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

function owonIdn(model: string): ReturnType<typeof parseIdn> {
  return parseIdn(`OWON,${model},SN,V1.0`);
}

// ---- registry <-> variant table round-trip ----

test("every XDM variant resolves to its per-SKU registry entry with correct modes", () => {
  const registry = createDefaultRegistry();
  for (const variant of XDM_VARIANTS) {
    const entry = registry.resolve(owonIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `owon-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "multimeter");
    assert.equal(entry!.defaultPort, 3000);
    const dmm = entry!.create(fakePort(), owonIdn(variant.variant)) as OwonXdm;
    assert.equal(dmm.profile.variant, variant.variant);
    assert.deepEqual(dmm.supportedModes, variant.modes);
  }
});

test("every SPE variant resolves to its per-SKU registry entry with correct limits", () => {
  const registry = createDefaultRegistry();
  for (const variant of SPE_VARIANTS) {
    const entry = registry.resolve(owonIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `owon-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    assert.equal(entry!.defaultPort, 3000);
    const psu = entry!.create(fakePort(), owonIdn(variant.variant)) as OwonSpe;
    assert.equal(psu.profile.variant, variant.variant);
    assert.equal(psu.profile.channels.length, variant.channels.length);
  }
});

test("every XDS variant resolves to its per-SKU registry entry with correct bandwidth", () => {
  const registry = createDefaultRegistry();
  for (const variant of XDS_VARIANTS) {
    const entry = registry.resolve(owonIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `owon-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    assert.equal(entry!.defaultPort, 3000);
    const scope = entry!.create(fakePort(), owonIdn(variant.variant)) as OwonXds;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.bandwidthMhz, variant.bandwidthMhz);
    assert.equal(scope.profile.channels, variant.channels);
  }
});

// ---- catch-all profile defaults ----

test("catch-all XDM entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(owonIdn("XDM9999"));
  assert.ok(entry);
  assert.equal(entry!.kind, "multimeter");
  const dmm = entry!.create(fakePort(), owonIdn("XDM9999")) as OwonXdm;
  assert.equal(dmm.profile.variant, "XDMxxxx");
  // Default profile is 4½-digit — no 4-wire.
  assert.ok(!dmm.supportedModes.includes("fourWireResistance"));
});

test("catch-all SPE entry advertises the single-channel default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(owonIdn("SPE9999"));
  assert.ok(entry);
  assert.equal(entry!.kind, "powerSupply");
  const psu = entry!.create(fakePort(), owonIdn("SPE9999")) as OwonSpe;
  assert.equal(psu.profile.variant, "SPExxxx");
  assert.equal(psu.profile.channels.length, 1);
});

test("catch-all XDS entry advertises the 4-channel / 100 MHz default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(owonIdn("XDS9999"));
  assert.ok(entry);
  assert.equal(entry!.kind, "oscilloscope");
  const scope = entry!.create(fakePort(), owonIdn("XDS9999")) as OwonXds;
  assert.equal(scope.profile.variant, "XDS3xxxx");
  assert.equal(scope.profile.channels, 4);
  assert.equal(scope.profile.bandwidthMhz, 100);
});

// ---- manufacturer pattern tolerance ----

test("Owon registry matches OWON / Owon / owon manufacturer strings", () => {
  const registry = createDefaultRegistry();
  assert.ok(registry.resolve(parseIdn("OWON,XDM2041,SN,FW")));
  assert.ok(registry.resolve(parseIdn("Owon,XDM2041,SN,FW")));
  assert.ok(registry.resolve(parseIdn("owon,XDM2041,SN,FW")));
  assert.ok(
    registry.resolve(parseIdn("Owon Technologies,XDM2041,SN,FW")),
    "parent-company marketing prefix must resolve",
  );
  assert.ok(
    registry.resolve(parseIdn("Lilliput Electronics,XDS3104AE,SN,FW")),
    "Lilliput (Owon parent) must resolve",
  );
});

test("Owon registry accepts blank manufacturer via model-only fallback", () => {
  const registry = createDefaultRegistry();
  // Blank manufacturer observed on some XDM firmware drops.
  const blankXdm = parseIdn(",XDM2041,SN,FW");
  assert.equal(blankXdm.manufacturer, "");
  const entry = registry.resolve(blankXdm);
  assert.ok(entry);
  assert.equal(entry!.kind, "multimeter");
  assert.equal(entry!.defaultPort, 3000);
});

test("Owon registry does not match non-Owon models (e.g. a Keysight DMM)", () => {
  const registry = createDefaultRegistry();
  // 34461A is a Keysight Truevolt; it must not resolve to an Owon driver.
  const keysight = parseIdn("Keysight Technologies,34461A,SN,FW");
  const entry = registry.resolve(keysight);
  assert.ok(entry);
  assert.ok(!entry!.id.startsWith("owon-"));
});

// ---- refine() behaviour ----

test("refineXdmProfile preserves the base profile when *OPT? is rejected", async () => {
  const base = XDM_VARIANTS.find((v) => v.variant === "XDM2041");
  assert.ok(base);
  const port: ScpiPort = {
    async query(): Promise<string> {
      throw new Error("Owon firmware rejects *OPT?");
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineXdmProfile(base!, port);
  assert.equal(refined.variant, base!.variant);
});

test("refineSpeProfile swallows *OPT? failure and returns base profile", async () => {
  const base = SPE_VARIANTS.find((v) => v.variant === "SPE3103");
  assert.ok(base);
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
  const refined = await refineSpeProfile(base!, port);
  assert.equal(refined.variant, base!.variant);
});

test("refineXdsProfile returns base when *OPT? is empty", async () => {
  const base = XDS_VARIANTS.find((v) => v.variant === "XDS3104AE");
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
  const refined = await refineXdsProfile(base!, port);
  assert.equal(refined.variant, base!.variant);
});
