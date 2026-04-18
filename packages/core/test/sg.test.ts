import test from "node:test";
import assert from "node:assert/strict";
import {
  DG900_VARIANTS,
  DG800_DEFAULT,
  DG900_DEFAULT,
  RigolDg900,
  createDefaultRegistry,
  parseIdn,
} from "../src/index.js";
import { FakeScpiPort } from "./helpers/fake-port.js";

const IDENTITY = {
  manufacturer: "rigol",
  manufacturerRaw: "RIGOL TECHNOLOGIES",
  model: "DG812",
  serial: "SIM000000",
  firmware: "00.01.05",
  raw: "RIGOL TECHNOLOGIES,DG812,SIM000000,00.01.05",
};

function wireDg900(port: FakeScpiPort): void {
  port.onQuery(/^\*IDN\?/, IDENTITY.raw);
  port.onQuery(/^\*OPT\?/, "0");
  port.onQuery(/^:OUTPut\d?\?/, "OFF");
  port.onQuery(/^:OUTPut\d:IMPedance\?/, "50");
  port.onQuery(/^:SOURce\d:FUNCtion\?/, "SIN");
  port.onQuery(/^:SOURce\d:FREQuency\?/, "1000");
  port.onQuery(/^:SOURce\d:VOLTage\?/, "1.0");
  port.onQuery(/^:SOURce\d:VOLTage:OFFSet\?/, "0");
  port.onQuery(/^:SOURce\d:PHASe\?/, "0");
  port.onQuery(/^:SOURce\d:FUNCtion:SQUare:DCYCle\?/, "50");
  port.onQuery(/^:SOURce\d:FUNCtion:RAMP:SYMMetry\?/, "50");
  port.onQuery(/^:SOURce\d:FUNCtion:PULSe:WIDTh\?/, "0.001");
  port.onQuery(/^:SOURce\d:FUNCtion:PULSe:TRANsition:LEADing\?/, "1e-8");
  port.onQuery(/^:SOURce\d:FUNCtion:PULSe:TRANsition:TRAiling\?/, "1e-8");
}

test("RigolDg900 advertises capability set from profile", () => {
  const port = new FakeScpiPort();
  const driver = new RigolDg900(port, IDENTITY, DG900_DEFAULT);
  assert.equal(driver.kind, "signalGenerator");
  assert.equal(driver.channels.channels.length, DG900_DEFAULT.channelCount);
  assert.equal(
    driver.channels.channels[0]!.frequencyMaxHz,
    DG900_DEFAULT.frequencyMaxHz,
  );
  assert.ok(driver.modulation.types.includes("am"));
  assert.ok(driver.sweep.spacings.includes("logarithmic"));
  assert.ok(driver.burst.modes.includes("nCycle"));
  assert.equal(driver.arbitrary.maxSamples, DG900_DEFAULT.arbitraryMaxSamples);
  assert.equal(driver.presets.slots, DG900_DEFAULT.presetSlots);
});

test("RigolDg900 getChannelState wires SCPI reads into a typed snapshot", async () => {
  const port = new FakeScpiPort();
  wireDg900(port);
  const driver = new RigolDg900(port, IDENTITY, DG900_DEFAULT);
  const state = await driver.getChannelState(1);
  assert.equal(state.id, 1);
  assert.equal(state.enabled, false);
  assert.equal(state.waveform.type, "sine");
  assert.equal(state.actual.frequencyHz, 1000);
  assert.equal(state.actual.amplitudeVpp, 1.0);
  assert.equal(state.impedance, "50ohm");
});

test("RigolDg900 setWaveform emits shape-specific commands", async () => {
  const port = new FakeScpiPort();
  const driver = new RigolDg900(port, IDENTITY, DG900_DEFAULT);
  await driver.setWaveform(1, {
    type: "square",
    frequencyHz: 10_000,
    amplitudeVpp: 2,
    offsetV: 0.1,
    dutyPct: 40,
  });
  assert.ok(port.writes.some((w) => w === ":SOURce1:FUNCtion SQU"));
  assert.ok(port.writes.some((w) => w === ":SOURce1:FREQuency 10000"));
  assert.ok(port.writes.some((w) => w === ":SOURce1:VOLTage 2"));
  assert.ok(
    port.writes.some((w) => w === ":SOURce1:FUNCtion:SQUare:DCYCle 40"),
    `writes: ${port.writes.join("|")}`,
  );
});

test("RigolDg900 validates waveform against profile limits", async () => {
  const port = new FakeScpiPort();
  const driver = new RigolDg900(port, IDENTITY, DG900_DEFAULT);
  await assert.rejects(
    () =>
      driver.setWaveform(1, {
        type: "sine",
        frequencyHz: 1e12,
        amplitudeVpp: 1,
        offsetV: 0,
      }),
    /frequency/i,
  );
  await assert.rejects(
    () =>
      driver.setWaveform(1, {
        type: "sine",
        frequencyHz: 1000,
        amplitudeVpp: 999,
        offsetV: 0,
      }),
    /amplitude/i,
  );
  await assert.rejects(
    () => driver.setChannelEnabled(99, true),
    /channel/i,
  );
});

test("RigolDg900 uploadArbitrary sends a binary block and records sample", async () => {
  const port = new FakeScpiPort();
  const driver = new RigolDg900(port, IDENTITY, DG900_DEFAULT);
  const samples = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
  const result = await driver.uploadArbitrary(1, "TESTWAVE", samples);
  assert.equal(result.sampleId, "TESTWAVE");
  assert.equal(result.sampleCount, samples.length);
  assert.equal(port.binaryWrites.length, 1);
  assert.match(port.binaryWrites[0]!.command, /TRACe:DATA:DAC16/);
  // int16 per sample => 2 bytes each.
  assert.equal(port.binaryWrites[0]!.data.byteLength, samples.length * 2);
  const list = await driver.listArbitrarySamples();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, "TESTWAVE");
});

test("registry resolves DG800/DG900 variants to variant-specific entries", () => {
  const registry = createDefaultRegistry();
  for (const variant of DG900_VARIANTS) {
    const parsed = parseIdn(`RIGOL TECHNOLOGIES,${variant.variant},SN,FW`);
    const entry = registry.resolve(parsed);
    assert.ok(entry, `resolve ${variant.variant}`);
    assert.equal(entry!.id, `rigol-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "signalGenerator");
    const driver = entry!.create(new FakeScpiPort(), parsed) as RigolDg900;
    assert.equal(driver.profile.variant, variant.variant);
  }
});

test("registry falls back to generic rigol-dg800 / rigol-dg900 entries", () => {
  const registry = createDefaultRegistry();
  const parsedDg8 = parseIdn("RIGOL TECHNOLOGIES,DG899,SN,FW");
  const entry8 = registry.resolve(parsedDg8);
  assert.ok(entry8);
  assert.equal(entry8!.kind, "signalGenerator");
  const drv8 = entry8!.create(new FakeScpiPort(), parsedDg8) as RigolDg900;
  assert.equal(drv8.profile.family, DG800_DEFAULT.family);

  const parsedDg9 = parseIdn("RIGOL TECHNOLOGIES,DG999,SN,FW");
  const entry9 = registry.resolve(parsedDg9);
  assert.ok(entry9);
  assert.equal(entry9!.kind, "signalGenerator");
  const drv9 = entry9!.create(new FakeScpiPort(), parsedDg9) as RigolDg900;
  assert.equal(drv9.profile.family, DG900_DEFAULT.family);
});
