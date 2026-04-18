import test from "node:test";
import assert from "node:assert/strict";
import {
  SSA3000X_VARIANTS,
  SSA3000X_DEFAULT,
  SiglentSsa3000x,
  createDefaultRegistry,
  parseIdn,
} from "../src/index.js";
import { FakeScpiPort } from "./helpers/fake-port.js";

const IDENTITY = {
  manufacturer: "siglent",
  manufacturerRaw: "Siglent Technologies",
  model: "SSA3032X-R",
  serial: "SIMSSA0001",
  firmware: "1.2.9.3R5",
  raw: "Siglent Technologies,SSA3032X-R,SIMSSA0001,1.2.9.3R5",
};

function wireFreq(port: FakeScpiPort): void {
  port.onQuery(/^:SENSe:FREQuency:CENTer\?/, "1.6e9");
  port.onQuery(/^:SENSe:FREQuency:SPAN\?/, "3.2e9");
  port.onQuery(/^:SENSe:FREQuency:STARt\?/, "0");
  port.onQuery(/^:SENSe:FREQuency:STOP\?/, "3.2e9");
  port.onQuery(/^:DISPlay:WINDow:TRACe:Y:SCALe:RLEVel\?/, "0");
}

test("SiglentSsa3000x advertises capabilities from profile", () => {
  const port = new FakeScpiPort();
  const variant = SSA3000X_VARIANTS.find((v) => v.variant === "SSA3032X-R")!;
  const driver = new SiglentSsa3000x(port, IDENTITY, variant);
  assert.equal(driver.kind, "spectrumAnalyzer");
  assert.equal(driver.frequencyRangeHz.max, 3.2e9);
  assert.equal(driver.traces.traceCount, variant.traceCount);
  assert.equal(driver.markers.count, variant.markerCount);
  assert.equal(driver.input.preamp.available, true);
  assert.equal(driver.presets?.slots, variant.presetSlots);
});

test("SiglentSsa3000x setFrequency center/span emits CENT + SPAN writes", async () => {
  const port = new FakeScpiPort();
  const driver = new SiglentSsa3000x(port, IDENTITY, SSA3000X_DEFAULT);
  await driver.setFrequency({ kind: "centerSpan", centerHz: 1e9, spanHz: 1e8 });
  assert.ok(port.writes.some((w) => w === ":SENSe:FREQuency:CENTer 1000000000"));
  assert.ok(port.writes.some((w) => w === ":SENSe:FREQuency:SPAN 100000000"));
});

test("SiglentSsa3000x setFrequency start/stop validates range", async () => {
  const port = new FakeScpiPort();
  const driver = new SiglentSsa3000x(port, IDENTITY, SSA3000X_DEFAULT);
  await driver.setFrequency({ kind: "startStop", startHz: 1e6, stopHz: 2e6 });
  assert.ok(port.writes.some((w) => w === ":SENSe:FREQuency:STARt 1000000"));
  assert.ok(port.writes.some((w) => w === ":SENSe:FREQuency:STOP 2000000"));
  await assert.rejects(
    () => driver.setFrequency({ kind: "startStop", startHz: 3e6, stopHz: 1e6 }),
    /greater/,
  );
  await assert.rejects(
    () => driver.setFrequency({ kind: "startStop", startHz: 0, stopHz: 10e9 }),
    /outside/,
  );
});

test("SiglentSsa3000x setReferenceLevel clamps to profile range", async () => {
  const port = new FakeScpiPort();
  const driver = new SiglentSsa3000x(port, IDENTITY, SSA3000X_DEFAULT);
  await driver.setReferenceLevel(-10);
  assert.ok(
    port.writes.some(
      (w) => w === ":DISPlay:WINDow:TRACe:Y:SCALe:RLEVel -10",
    ),
  );
  await assert.rejects(() => driver.setReferenceLevel(50), /outside/);
});

test("SiglentSsa3000x readTrace parses CSV and synthesises freq axis", async () => {
  const port = new FakeScpiPort();
  wireFreq(port);
  const csv = "-10.1,-20.2,-30.3,-40.4,-50.5";
  port.onQuery(/^:TRACe:DATA\? 1$/, csv);
  const driver = new SiglentSsa3000x(port, IDENTITY, SSA3000X_DEFAULT);
  const trace = await driver.readTrace(1);
  assert.equal(trace.id, 1);
  assert.equal(trace.points, 5);
  assert.equal(trace.unit, "dBm");
  assert.ok(Math.abs(trace.amplitude[0]! - -10.1) < 1e-9);
  assert.equal(trace.frequencyHz[0], 0);
  assert.equal(trace.frequencyHz[trace.frequencyHz.length - 1], 3.2e9);
});

test("SiglentSsa3000x marker configure + read", async () => {
  const port = new FakeScpiPort();
  port.onQuery(/^:CALCulate:MARKer1:STATe\?/, "1");
  port.onQuery(/^:CALCulate:MARKer1:MODE\?/, "POS");
  port.onQuery(/^:CALCulate:MARKer1:X\?/, "1.234e9");
  port.onQuery(/^:CALCulate:MARKer1:Y\?/, "-15.5");
  const driver = new SiglentSsa3000x(port, IDENTITY, SSA3000X_DEFAULT);
  await driver.setMarker(1, {
    enabled: true,
    type: "normal",
    frequencyHz: 1.234e9,
  });
  assert.ok(port.writes.some((w) => w === ":CALCulate:MARKer1:STATe ON"));
  assert.ok(port.writes.some((w) => w === ":CALCulate:MARKer1:X 1234000000"));
  const reading = await driver.readMarker(1);
  assert.equal(reading.enabled, true);
  assert.equal(reading.frequencyHz, 1.234e9);
  assert.equal(reading.amplitude, -15.5);
});

test("SiglentSsa3000x setInput rejects preamp when variant has none", async () => {
  const noPreamp = { ...SSA3000X_DEFAULT, preampFreqRangeHz: null as null };
  const port = new FakeScpiPort();
  const driver = new SiglentSsa3000x(port, IDENTITY, noPreamp);
  await assert.rejects(
    () => driver.setInput({ preampEnabled: true }),
    /preamp/,
  );
});

test("registry resolves SSA3032X-R IDN to siglent-ssa3032x-r", () => {
  const registry = createDefaultRegistry();
  const idn = parseIdn(IDENTITY.raw);
  const entry = registry.resolve(idn);
  assert.ok(entry);
  assert.equal(entry!.id, "siglent-ssa3032x-r");
  assert.equal(entry!.kind, "spectrumAnalyzer");
});

test("registry falls back to siglent-ssa3000x for unknown SSA3 variants", () => {
  const registry = createDefaultRegistry();
  const idn = parseIdn("Siglent Technologies,SSA3075X,SIM,1.0");
  const entry = registry.resolve(idn);
  assert.ok(entry);
  assert.equal(entry!.id, "siglent-ssa3000x");
});
