import test from "node:test";
import assert from "node:assert/strict";
import {
  RTB_VARIANTS,
  NGE_VARIANTS,
  HMC_VARIANTS,
  SMA_VARIANTS,
  HMF_VARIANTS,
  FPC_VARIANTS,
  RndsRtb,
  RndsNge,
  RndsHmc,
  RndsSma,
  RndsHmf,
  RndsFpc,
  createDefaultRegistry,
  parseIdn,
  refineRtbProfile,
  refineSmaProfile,
  refineFpcProfile,
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

function rndsIdn(
  model: string,
  vendor = "Rohde&Schwarz",
): ReturnType<typeof parseIdn> {
  return parseIdn(`${vendor},${model},SN,FW`);
}

// ---- registry <-> variant table round-trip ----

test("every RTB/RTM/RTA/MXO/HMO variant resolves to its per-SKU registry entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of RTB_VARIANTS) {
    const vendor = variant.hamegLegacy ? "HAMEG" : "Rohde&Schwarz";
    const entry = registry.resolve(rndsIdn(variant.variant, vendor));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `rnds-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "oscilloscope");
    const scope = entry!.create(
      fakePort(),
      rndsIdn(variant.variant, vendor),
    ) as RndsRtb;
    assert.equal(scope.profile.variant, variant.variant);
    assert.equal(scope.profile.channels, variant.channels);
  }
});

test("every NGE/NGL/NGM/NGP/NGU/HMP/HMC8043 PSU variant resolves", () => {
  const registry = createDefaultRegistry();
  for (const variant of NGE_VARIANTS) {
    const vendor = variant.variant.startsWith("HMP")
      ? "HAMEG"
      : "Rohde&Schwarz";
    const entry = registry.resolve(rndsIdn(variant.variant, vendor));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.id, `rnds-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "powerSupply");
    const psu = entry!.create(
      fakePort(),
      rndsIdn(variant.variant, vendor),
    ) as RndsNge;
    assert.equal(psu.profile.variant, variant.variant);
  }
});

test("every HMC8012 / HMC8015 DMM variant resolves to the multimeter entry", () => {
  const registry = createDefaultRegistry();
  for (const variant of HMC_VARIANTS) {
    const entry = registry.resolve(rndsIdn(variant.variant, "HAMEG"));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "multimeter");
    const dmm = entry!.create(fakePort(), rndsIdn(variant.variant, "HAMEG")) as RndsHmc;
    assert.equal(dmm.profile.variant, variant.variant);
  }
});

test("every SMA/SMB/SMBV signal-generator variant resolves", () => {
  const registry = createDefaultRegistry();
  for (const variant of SMA_VARIANTS) {
    const entry = registry.resolve(rndsIdn(variant.variant));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "signalGenerator");
    const sg = entry!.create(fakePort(), rndsIdn(variant.variant)) as RndsSma;
    assert.equal(sg.profile.variant, variant.variant);
    assert.equal(sg.profile.hasVector, variant.hasVector);
  }
});

test("every HMF / HMC804x function-generator variant resolves", () => {
  const registry = createDefaultRegistry();
  for (const variant of HMF_VARIANTS) {
    const entry = registry.resolve(rndsIdn(variant.variant, "HAMEG"));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "signalGenerator");
    const fg = entry!.create(
      fakePort(),
      rndsIdn(variant.variant, "HAMEG"),
    ) as RndsHmf;
    assert.equal(fg.profile.variant, variant.variant);
  }
});

test("every FPC/FPL/HMS spectrum-analyzer variant resolves", () => {
  const registry = createDefaultRegistry();
  for (const variant of FPC_VARIANTS) {
    const vendor = variant.variant.startsWith("HMS")
      ? "HAMEG"
      : "Rohde&Schwarz";
    const entry = registry.resolve(rndsIdn(variant.variant, vendor));
    assert.ok(entry, `missing entry for ${variant.variant}`);
    assert.equal(entry!.kind, "spectrumAnalyzer");
    const sa = entry!.create(
      fakePort(),
      rndsIdn(variant.variant, vendor),
    ) as RndsFpc;
    assert.equal(sa.profile.variant, variant.variant);
  }
});

// ---- manufacturer pattern tolerance ----

test("R&S manufacturer regex matches R&S / Rohde&Schwarz / HAMEG spellings", () => {
  const registry = createDefaultRegistry();
  assert.ok(registry.resolve(parseIdn("Rohde&Schwarz,RTB2004,SN,FW")));
  assert.ok(registry.resolve(parseIdn("Rohde & Schwarz,RTB2004,SN,FW")));
  assert.ok(registry.resolve(parseIdn("R&S,RTB2004,SN,FW")));
  assert.ok(registry.resolve(parseIdn("HAMEG,HMO1202,SN,FW")));
});

// ---- catch-all routing ----

test("catch-all RTB entry routes unknown RTB/RTM/RTA/MXO/HMO model suffixes", () => {
  const registry = createDefaultRegistry();
  for (const model of ["RTB9999", "RTM9999", "RTA9999", "MXO99", "HMO9999"]) {
    const entry = registry.resolve(rndsIdn(model));
    assert.ok(entry, `${model} must resolve via the RTB family catch-all`);
    assert.equal(entry!.kind, "oscilloscope");
  }
});

test("catch-all NGx PSU entry routes NGE/NGL/NGM/NGP/NGU/HMP suffixes", () => {
  const registry = createDefaultRegistry();
  for (const model of ["NGE9999", "NGL999", "NGM999", "NGP999", "NGU999", "HMP9999"]) {
    const vendor = model.startsWith("HMP") ? "HAMEG" : "Rohde&Schwarz";
    const entry = registry.resolve(rndsIdn(model, vendor));
    assert.ok(entry, `${model} must resolve via the NGx catch-all`);
    assert.equal(entry!.kind, "powerSupply");
  }
});

test("HMC8012/8015 routes to DMM; HMC8043 (PSU) never hits the DMM entry", () => {
  const registry = createDefaultRegistry();
  const dmm = registry.resolve(parseIdn("Rohde&Schwarz,HMC8012,SN,FW"));
  assert.equal(dmm?.kind, "multimeter");
  const psu = registry.resolve(parseIdn("Rohde&Schwarz,HMC8043,SN,FW"));
  assert.equal(psu?.kind, "powerSupply");
});

// ---- refine() behaviour ----

test("refineRtbProfile widens digital channels and decoders from *OPT? tokens", async () => {
  const base = RTB_VARIANTS.find((v) => v.variant === "RTB2004")!;
  assert.equal(base.digitalChannels, 0);
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "B1,K1,K3,HV-EXT";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineRtbProfile(base, port);
  assert.equal(refined.digitalChannels, 16);
  assert.ok(refined.decoders.includes("i2c"));
  assert.ok(refined.decoders.includes("spi"));
  assert.ok(refined.decoders.includes("can"));
});

test("refineRtbProfile preserves base when *OPT? is rejected", async () => {
  const base = RTB_VARIANTS[0]!;
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
  const refined = await refineRtbProfile(base, port);
  assert.equal(refined.variant, base.variant);
});

test("refineSmaProfile flips hasVector when K1 is reported", async () => {
  const base = SMA_VARIANTS.find((v) => v.variant === "SMA100A")!;
  assert.equal(base.hasVector, false);
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "K1,B103";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineSmaProfile(base, port);
  assert.equal(refined.hasVector, true);
});

test("refineFpcProfile detects the tracking-generator B22 / TG option", async () => {
  const base = FPC_VARIANTS.find((v) => v.variant === "FPC1000")!;
  const port: ScpiPort = {
    async query(): Promise<string> {
      return "B22";
    },
    async queryBinary(): Promise<Uint8Array> {
      return new Uint8Array();
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const refined = await refineFpcProfile(base, port);
  assert.equal(refined.hasTrackingGenerator, true);
});

// ---- waveform decoder coverage ----

test("RTB waveform decode handles CHANnel:DATA? 16-bit big-endian samples", async () => {
  const samples = [0, 20_000, -20_000, 1];
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(i * 2, samples[i]!, false);
  }
  const header = `-1e-6,1e-6,${samples.length},1`;
  const port: ScpiPort = {
    async query(cmd: string): Promise<string> {
      if (/DATA:HEADER\?/i.test(cmd)) return header;
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return bytes;
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const identity = rndsIdn("RTB2004");
  const scope = new RndsRtb(
    port,
    identity,
    RTB_VARIANTS.find((v) => v.variant === "RTB2004")!,
  );
  const wf = await scope.readWaveform(1);
  assert.equal(wf.y.length, samples.length);
  assert.ok(wf.y[1]! > 0 && wf.y[1]! < 1);
  assert.ok(wf.y[2]! < 0 && wf.y[2]! > -1);
});

test("HMO legacy waveform decode handles CHANnel:DATA? 8-bit samples", async () => {
  const samples = [0, 100, -100, 50];
  const bytes = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    bytes[i] = samples[i]! & 0xff;
  }
  const header = `-1e-6,1e-6,${samples.length},1`;
  const port: ScpiPort = {
    async query(cmd: string): Promise<string> {
      if (/DATA:HEADER\?/i.test(cmd)) return header;
      return "";
    },
    async queryBinary(): Promise<Uint8Array> {
      return bytes;
    },
    async write(): Promise<void> {},
    async writeBinary(): Promise<void> {},
  };
  const identity = rndsIdn("HMO1202", "HAMEG");
  const scope = new RndsRtb(
    port,
    identity,
    RTB_VARIANTS.find((v) => v.variant === "HMO1202")!,
  );
  const wf = await scope.readWaveform(1);
  assert.equal(wf.y.length, samples.length);
});
