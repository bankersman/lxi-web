import test from "node:test";
import assert from "node:assert/strict";
import {
  GDS_VARIANTS,
  GPP_VARIANTS,
  GDM_VARIANTS,
  GSP_VARIANTS,
  GW_AFG_VARIANTS,
  GwInstekAfg,
  GwInstekGdm,
  GwInstekGds,
  GwInstekGpp,
  GwInstekGsp,
  createDefaultRegistry,
  parseIdn,
  refineGspProfile,
} from "../src/index.js";
import { decodeGdsMemory } from "../src/drivers/gw-instek/gds.js";
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

function gwIdn(model: string, vendor = "GW Instek"): ReturnType<typeof parseIdn> {
  return parseIdn(`${vendor},${model},SN,FW`);
}

// ---- registry <-> variant table round-trip ----

test("every GDS oscilloscope variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of GDS_VARIANTS) {
    const entry = registry.resolve(gwIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `gwinstek-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), gwIdn(variant.variant)) as GwInstekGds;
    assert.equal(scope.profile.variant, variant.variant);
  }
});

test("every GPP/GPD/PSW variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of GPP_VARIANTS) {
    const entry = registry.resolve(gwIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `gwinstek-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    const psu = entry!.create(fakePort(), gwIdn(variant.variant)) as GwInstekGpp;
    assert.equal(psu.profile.variant, variant.variant);
  }
});

test("every GDM variant resolves through the multimeter façade", () => {
  const registry = createDefaultRegistry();
  for (const variant of GDM_VARIANTS) {
    const entry = registry.resolve(gwIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "multimeter");
    const dmm = entry!.create(fakePort(), gwIdn(variant.variant)) as GwInstekGdm;
    assert.equal(dmm.profile.variant, variant.variant);
    assert.equal(dmm.profile.digits, variant.digits);
  }
});

test("every AFG variant resolves through the signal-generator façade", () => {
  const registry = createDefaultRegistry();
  for (const variant of GW_AFG_VARIANTS) {
    const entry = registry.resolve(gwIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "signalGenerator");
    const afg = entry!.create(fakePort(), gwIdn(variant.variant)) as GwInstekAfg;
    assert.equal(afg.profile.variant, variant.variant);
  }
});

test("every GSP variant resolves through the spectrum-analyzer façade", () => {
  const registry = createDefaultRegistry();
  for (const variant of GSP_VARIANTS) {
    const entry = registry.resolve(gwIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "spectrumAnalyzer");
    const sa = entry!.create(fakePort(), gwIdn(variant.variant)) as GwInstekGsp;
    assert.equal(sa.profile.variant, variant.variant);
  }
});

// ---- manufacturer pattern tolerance ----

test("GW Instek manufacturer regex matches vendor-name variants", () => {
  const registry = createDefaultRegistry();
  assert.ok(registry.resolve(parseIdn("GW Instek,GDS-1054B,SN,FW")));
  assert.ok(registry.resolve(parseIdn("GWINSTEK,GDS-1054B,SN,FW")));
  assert.ok(registry.resolve(parseIdn("GW-INSTEK,GDS-1054B,SN,FW")));
  assert.ok(registry.resolve(parseIdn("GoodWill Instrument,GDS-1054B,SN,FW")));
});

// ---- catch-all routing ----

test("catch-all entries route unseen GDS / GPP / GDM / AFG / GSP model numbers", () => {
  const registry = createDefaultRegistry();
  const cases: readonly { model: string; kind: string }[] = [
    { model: "GDS-2304", kind: "oscilloscope" },
    { model: "MSO-5254", kind: "oscilloscope" },
    { model: "GPP-2232", kind: "powerSupply" },
    { model: "PSW80-40", kind: "powerSupply" },
    { model: "GDM-8261", kind: "multimeter" },
    { model: "AFG-2200", kind: "signalGenerator" },
    { model: "MFG-2130", kind: "signalGenerator" },
    { model: "GSP-930", kind: "spectrumAnalyzer" },
  ];
  for (const c of cases) {
    const entry = registry.resolve(gwIdn(c.model));
    assert.ok(entry, `${c.model} must resolve via a catch-all`);
    assert.equal(entry!.kind, c.kind);
  }
});

// ---- per-variant feature gating ----

test("GPD variants do not expose OVP / OCP / presets", () => {
  const variant = GPP_VARIANTS.find((v) => v.variant === "GPD-4303S")!;
  const psu = new GwInstekGpp(fakePort(), gwIdn("GPD-4303S"), variant);
  assert.equal(psu.protection, undefined);
  assert.equal(psu.presets, undefined);
});

test("GPP variants expose OVP / OCP / presets", () => {
  const variant = GPP_VARIANTS.find((v) => v.variant === "GPP-4323")!;
  const psu = new GwInstekGpp(fakePort(), gwIdn("GPP-4323"), variant);
  assert.ok(psu.protection, "GPP-4323 must expose protection");
  assert.ok(psu.presets, "GPP-4323 must expose preset memory");
});

test("GPD rejects protection / preset calls with a helpful error", async () => {
  const variant = GPP_VARIANTS.find((v) => v.variant === "GPD-4303S")!;
  const psu = new GwInstekGpp(fakePort(), gwIdn("GPD-4303S"), variant);
  await assert.rejects(() => psu.getProtection(1, "ovp"));
  await assert.rejects(() => psu.savePreset(0));
});

test("GDM-8261A (5½-digit) does not advertise dual-display or math", () => {
  const variant = GDM_VARIANTS.find((v) => v.variant === "GDM-8261A")!;
  assert.equal(variant.hasDualDisplay, false);
  assert.equal(variant.hasMath, false);
});

test("GDM-9061 advertises dual-display + temperature", () => {
  const variant = GDM_VARIANTS.find((v) => v.variant === "GDM-9061")!;
  assert.equal(variant.hasDualDisplay, true);
  assert.equal(variant.hasTemperature, true);
  assert.ok(variant.modes.includes("temperature"));
});

test("AFG-2005 has no arbitrary memory and no preset slots", () => {
  const variant = GW_AFG_VARIANTS.find((v) => v.variant === "AFG-2005")!;
  const afg = new GwInstekAfg(fakePort(), gwIdn("AFG-2005"), variant);
  assert.equal(variant.hasArbitrary, false);
  assert.equal(afg.presets, undefined);
  assert.ok(!afg.channels.channels[0]!.supportedWaveforms.includes("arbitrary"));
});

// ---- refine() behaviour ----

test("refineGspProfile flags tracking generator when *OPT? advertises TG", async () => {
  const base = GSP_VARIANTS.find((v) => v.variant === "GSP-9330")!;
  assert.equal(base.hasTrackingGenerator, false);
  const port: ScpiPort = {
    async query(cmd: string): Promise<string> {
      if (/OPT/i.test(cmd)) return "TG,ADV";
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineGspProfile(base, port);
  assert.equal(refined.hasTrackingGenerator, true);
});

test("refineGspProfile preserves base when *OPT? throws", async () => {
  const base = GSP_VARIANTS[0]!;
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
  const refined = await refineGspProfile(base, port);
  assert.equal(refined.variant, base.variant);
  assert.equal(refined.hasTrackingGenerator, base.hasTrackingGenerator);
});

// ---- GDS ASCII-preamble waveform decoder ----

test("decodeGdsMemory parses a canonical GDS preamble + CSV sample payload", () => {
  const header = [
    "Format,1.00",
    "Memory Length,4",
    "Trigger Address,2",
    "Sampling Period,1.000000e-06",
    "Vertical Scale,2.000e-01",
    "Vertical Position,0.000e+00",
    "Horizontal Scale,1.000e-03",
    "Probe,1",
    "Raw Waveform Data:",
  ].join("\n");
  const body = "25,50,-25,-50";
  const wf = decodeGdsMemory(`${header}\n${body}`, 1);
  assert.equal(wf.channel, 1);
  assert.equal(wf.y.length, 4);
  assert.equal(wf.x.length, 4);
  assert.equal(wf.xIncrement, 1e-6);
  assert.ok(Math.abs(wf.y[0]! - (25 * 0.2) / 25) < 1e-9);
  assert.ok(Math.abs(wf.y[1]! - (50 * 0.2) / 25) < 1e-9);
});

test("decodeGdsMemory tolerates a missing preamble by falling back to defaults", () => {
  const wf = decodeGdsMemory("1,2,3,4", 2);
  assert.equal(wf.channel, 2);
  assert.equal(wf.y.length, 0, "body without marker is ignored");
});

test("every variant survives a no-op refine against a silent port", async () => {
  const port = fakePort();
  for (const variant of GDS_VARIANTS) {
    const refined = await (await import("../src/drivers/gw-instek/gds-profile.js"))
      .refineGdsProfile(variant, port);
    assert.equal(refined.variant, variant.variant);
  }
  for (const variant of GPP_VARIANTS) {
    const refined = await (await import("../src/drivers/gw-instek/gpp-profile.js"))
      .refineGppProfile(variant, port);
    assert.equal(refined.variant, variant.variant);
  }
  for (const variant of GDM_VARIANTS) {
    const refined = await (await import("../src/drivers/gw-instek/gdm-profile.js"))
      .refineGdmProfile(variant, port);
    assert.equal(refined.variant, variant.variant);
  }
  for (const variant of GW_AFG_VARIANTS) {
    const refined = await (await import("../src/drivers/gw-instek/afg-profile.js"))
      .refineAfgProfile(variant, port);
    assert.equal(refined.variant, variant.variant);
  }
});
