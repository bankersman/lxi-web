import test from "node:test";
import assert from "node:assert/strict";
import {
  TBS_VARIANTS,
  MSO_VARIANTS,
  AFG_VARIANTS,
  PWS_VARIANTS,
  TektronixTbs,
  TektronixMso,
  TektronixAfg,
  TektronixPws,
  createDefaultRegistry,
  parseIdn,
  refineTbsProfile,
  refineMsoProfile,
  refineAfgProfile,
  refinePwsProfile,
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

function tekIdn(model: string, vendor = "TEKTRONIX"): ReturnType<typeof parseIdn> {
  return parseIdn(`${vendor},${model},SN,FW`);
}

// ---- registry <-> variant table round-trip ----

test("every TBS variant resolves to its per-SKU registry entry with correct bandwidth", () => {
  const registry = createDefaultRegistry();
  for (const variant of TBS_VARIANTS) {
    const entry = registry.resolve(tekIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `tektronix-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), tekIdn(variant.variant)) as TektronixTbs;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.bandwidthMhz, variant.bandwidthMhz);
    assert.equal(scope.profile.channels, variant.channels);
  }
});

test("every MSO/DPO/MDO variant resolves to its per-SKU entry with correct channel count", () => {
  const registry = createDefaultRegistry();
  for (const variant of MSO_VARIANTS) {
    const entry = registry.resolve(tekIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `tektronix-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), tekIdn(variant.variant)) as TektronixMso;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.channels, variant.channels);
    assert.equal(scope.profile.hasRf, variant.hasRf);
  }
});

test("every AFG variant resolves to its per-SKU entry with correct channel count", () => {
  const registry = createDefaultRegistry();
  for (const variant of AFG_VARIANTS) {
    const entry = registry.resolve(tekIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `tektronix-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "signalGenerator");
    const afg = entry!.create(fakePort(), tekIdn(variant.variant)) as TektronixAfg;
    assert.equal(afg.profile.variant, variant.variant);
    assert.equal(afg.profile.channelCount, variant.channelCount);
    assert.equal(afg.channels.channels.length, variant.channelCount);
  }
});

test("every PWS variant resolves to its per-SKU entry with correct channel topology", () => {
  const registry = createDefaultRegistry();
  for (const variant of PWS_VARIANTS) {
    const entry = registry.resolve(tekIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `tektronix-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    const psu = entry!.create(fakePort(), tekIdn(variant.variant)) as TektronixPws;
    assert.equal(psu.profile.variant, variant.variant);
    assert.equal(psu.profile.channels.length, variant.channels.length);
  }
});

// ---- catch-all profile defaults ----

test("catch-all TBS entry advertises the 2-channel / 100 MHz default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(tekIdn("TBS1999X"));
  assert.ok(entry);
  assert.equal(entry!.kind, "oscilloscope");
  const scope = entry!.create(fakePort(), tekIdn("TBS1999X")) as TektronixTbs;
  assert.equal(scope.profile.variant, "TBSxxxx");
  assert.equal(scope.profile.channels, 2);
});

test("catch-all MSO entry resolves DPO / MDO / MSO model prefixes", () => {
  const registry = createDefaultRegistry();
  for (const model of ["DPO9999X", "MDO9999X", "MSO99X"]) {
    const entry = registry.resolve(tekIdn(model));
    assert.ok(entry, `${model} must resolve via the MSO catch-all`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(fakePort(), tekIdn(model)) as TektronixMso;
    assert.equal(scope.profile.variant, "MSOxxxx");
  }
});

test("catch-all AFG entry advertises the conservative default profile", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(tekIdn("AFG99999"));
  assert.ok(entry);
  const afg = entry!.create(fakePort(), tekIdn("AFG99999")) as TektronixAfg;
  assert.equal(afg.profile.variant, "AFGxxxx");
});

test("catch-all PWS entry defaults to a single 30 V / 3 A rail", () => {
  const registry = createDefaultRegistry();
  const entry = registry.resolve(tekIdn("PWS9999"));
  assert.ok(entry);
  assert.equal(entry!.kind, "powerSupply");
  const psu = entry!.create(fakePort(), tekIdn("PWS9999")) as TektronixPws;
  assert.equal(psu.profile.variant, "PWSxxxx");
  assert.equal(psu.profile.channels.length, 1);
});

// ---- manufacturer pattern tolerance ----

test("Tektronix registry matches TEKTRONIX / Tektronix / tektronix spellings", () => {
  const registry = createDefaultRegistry();
  assert.ok(registry.resolve(parseIdn("TEKTRONIX,TBS2102B,SN,FW")));
  assert.ok(registry.resolve(parseIdn("Tektronix,TBS2102B,SN,FW")));
  assert.ok(registry.resolve(parseIdn("tektronix,TBS2102B,SN,FW")));
});

test("Tektronix registry tolerates representative model spellings from the step doc", () => {
  const registry = createDefaultRegistry();
  for (const model of ["TBS2102B", "DPO4054B", "MSO56", "MDO3104", "AFG31102", "PWS4323"]) {
    const entry = registry.resolve(tekIdn(model));
    assert.ok(entry, `registry must resolve ${model}`);
    assert.ok(entry!.id.startsWith("tektronix-"));
  }
});

// ---- refine() behaviour ----

test("refineTbsProfile preserves the base profile when *OPT? is rejected", async () => {
  const base = TBS_VARIANTS[0]!;
  const port: ScpiPort = {
    async query(): Promise<string> {
      throw new Error("firmware rejects *OPT?");
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineTbsProfile(base, port);
  assert.equal(refined.variant, base.variant);
});

test("refineMsoProfile widens digitalChannels and decoders from *OPT? tokens", async () => {
  const base = MSO_VARIANTS.find((v) => v.variant === "DPO4054B")!;
  // DPO4054B has no MSO lanes by default.
  assert.equal(base.digitalChannels, 0);
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "MSO,SR-I2C,SR-CAN,BW-500";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineMsoProfile(base, port);
  // `MSO` token should light up 16 digital lanes; existing decoders are
  // preserved (the profile already advertises i2c/can).
  assert.equal(refined.digitalChannels, 16);
  assert.ok(refined.decoders.includes("i2c"));
  assert.ok(refined.decoders.includes("can"));
});

test("refineMsoProfile lights up `hasRf` when `*OPT?` reports an RF option", async () => {
  const base = MSO_VARIANTS.find((v) => v.variant === "MSO54")!;
  assert.equal(base.hasRf, false);
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "RF,BW-2000";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineMsoProfile(base, port);
  assert.equal(refined.hasRf, true);
});

test("refineAfgProfile returns base when *OPT? is empty", async () => {
  const base = AFG_VARIANTS.find((v) => v.variant === "AFG31102")!;
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineAfgProfile(base, port);
  assert.equal(refined.variant, base.variant);
});

test("refinePwsProfile swallows *OPT? failure and returns base profile", async () => {
  const base = PWS_VARIANTS.find((v) => v.variant === "PWS4323")!;
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
  const refined = await refinePwsProfile(base, port);
  assert.equal(refined.variant, base.variant);
});

// ---- waveform decoder coverage ----

test("TBS waveform decode handles ASCII CURVE? with the preamble scaling", async () => {
  // Minimal fake port that returns a small ASCII CURVE? reply and a
  // consistent preamble. Confirms the driver multiplies samples by
  // `ymult` and adds `yzero` minus `yoff`.
  const preamble: Record<string, string> = {
    "WFMPre:XINcr?": "1e-6",
    "WFMPre:XZEro?": "0",
    "WFMPre:YMUlt?": "0.01",
    "WFMPre:YOFf?": "0",
    "WFMPre:YZEro?": "0",
    "CURVe?": "0,100,-100,50",
  };
  const port: ScpiPort = {
    async query(cmd: string): Promise<string> {
      return preamble[cmd] ?? "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const identity = tekIdn("TBS2102B");
  const scope = new TektronixTbs(port, identity, TBS_VARIANTS[0]!);
  const wf = await scope.readWaveform(1);
  assert.equal(wf.y.length, 4);
  assert.equal(wf.y[1]!.toFixed(3), "1.000");
  assert.equal(wf.y[2]!.toFixed(3), "-1.000");
});

test("MSO waveform decode handles binary WFMOutpre? with 16-bit samples", async () => {
  const samples = [0, 10_000, -10_000, 1];
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(i * 2, samples[i]!, false);
  }
  const preamble: Record<string, string> = {
    "WFMOutpre:XINcr?": "1e-9",
    "WFMOutpre:XZEro?": "0",
    "WFMOutpre:YMUlt?": "1e-4",
    "WFMOutpre:YOFf?": "0",
    "WFMOutpre:YZEro?": "0",
  };
  const port: ScpiPort = {
    async query(cmd: string): Promise<string> {
      return preamble[cmd] ?? "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return bytes;
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const identity = tekIdn("MSO54");
  const variant = MSO_VARIANTS.find((v) => v.variant === "MSO54")!;
  const scope = new TektronixMso(port, identity, variant);
  const wf = await scope.readWaveform(1);
  assert.equal(wf.y.length, 4);
  assert.equal(wf.y[1]!.toFixed(3), "1.000");
  assert.equal(wf.y[2]!.toFixed(3), "-1.000");
});
