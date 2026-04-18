import test from "node:test";
import assert from "node:assert/strict";
import {
  RigolDho800,
  RigolDm858,
  RigolDp900,
  createDefaultRegistry,
  parseIdn,
} from "../src/index.js";
import { FakeScpiPort } from "./helpers/fake-port.js";

test("default registry resolves DHO804 with firmware suffix", () => {
  const registry = createDefaultRegistry();
  const idn = parseIdn("RIGOL TECHNOLOGIES,DHO804,DHO8A1234567,00.01.03");
  const entry = registry.resolve(idn);
  assert.ok(entry);
  assert.equal(entry!.id, "rigol-dho800");
  assert.equal(entry!.kind, "oscilloscope");
});

test("default registry resolves DP932E and DM858", () => {
  const registry = createDefaultRegistry();
  const psu = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DP932E,SN,FW"));
  const dmm = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DM858,SN,FW"));
  assert.equal(psu?.id, "rigol-dp900");
  assert.equal(dmm?.id, "rigol-dm800");
});

test("default registry returns null for unsupported vendors", () => {
  const registry = createDefaultRegistry();
  const idn = parseIdn("KEYSIGHT,DSOX1204G,SN,FW");
  assert.equal(registry.resolve(idn), null);
});

test("DHO800 getChannels issues expected queries and parses reply", async () => {
  const port = new FakeScpiPort()
    .onQuery(/^:CHANnel1:DISPlay\?$/, "1")
    .onQuery(/^:CHANnel1:SCALe\?$/, "0.5")
    .onQuery(/^:CHANnel1:OFFSet\?$/, "-0.1")
    .onQuery(/^:CHANnel1:COUPling\?$/, "DC")
    .onQuery(/^:CHANnel1:PROBe\?$/, "10")
    .onQuery(/^:CHANnel\d:DISPlay\?$/, "0")
    .onQuery(/^:CHANnel\d:SCALe\?$/, "1")
    .onQuery(/^:CHANnel\d:OFFSet\?$/, "0")
    .onQuery(/^:CHANnel\d:COUPling\?$/, "AC")
    .onQuery(/^:CHANnel\d:PROBe\?$/, "1");

  const idn = parseIdn("RIGOL TECHNOLOGIES,DHO804,SN,FW");
  const scope = new RigolDho800(port, idn);
  const channels = await scope.getChannels();
  assert.equal(channels.length, 4);
  assert.equal(channels[0]!.enabled, true);
  assert.equal(channels[0]!.scale, 0.5);
  assert.equal(channels[0]!.coupling, "dc");
  assert.equal(channels[0]!.probeAttenuation, 10);
  assert.equal(channels[1]!.enabled, false);
  assert.equal(channels[1]!.coupling, "ac");
});

test("DHO800 setChannelEnabled and setTimebase emit the right commands", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setChannelEnabled(2, true);
  await scope.setTimebase({ scale: 1e-6, position: 0 });
  assert.deepEqual(port.writes, [
    ":CHANnel2:DISPlay ON",
    ":TIMebase:MAIN:SCALe 0.000001",
    ":TIMebase:MAIN:OFFSet 0",
  ]);
});

test("DHO800 readWaveform decodes preamble and byte block", async () => {
  const body = new Uint8Array([0, 128, 255]);
  const port = new FakeScpiPort()
    .onQuery(/:WAVeform:PREamble\?/,
      // format,type,points,count,xinc,xorigin,xref,yinc,yorigin,yref
      "0,0,3,1,1e-6,-1.5e-6,0,0.01,128,0",
    )
    .onQuery(/:WAVeform:DATA\?/, body);

  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  const waveform = await scope.readWaveform(1);
  assert.equal(waveform.channel, 1);
  assert.equal(waveform.x.length, 3);
  assert.equal(waveform.y.length, 3);
  assert.ok(Math.abs(waveform.x[0]! - -1.5e-6) < 1e-12);
  assert.ok(Math.abs(waveform.x[2]! - (-1.5e-6 + 2 * 1e-6)) < 1e-12);
  // byte 0 → (0 - 128 - 0) * 0.01 = -1.28
  assert.ok(Math.abs(waveform.y[0]! - -1.28) < 1e-9);
  // byte 128 → 0V exactly
  assert.ok(Math.abs(waveform.y[1]!) < 1e-9);
});

test("DP900 measureChannel parses V,I,P triple", async () => {
  const port = new FakeScpiPort().onQuery(
    /:MEASure:ALL\?\s+CH1/,
    "5.012,0.123,0.6165",
  );
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  const m = await psu.measureChannel(1);
  assert.equal(m.voltage, 5.012);
  assert.equal(m.current, 0.123);
  assert.equal(m.power, 0.6165);
});

test("DP900 setChannelVoltage / output send expected commands", async () => {
  const port = new FakeScpiPort();
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  await psu.setChannelVoltage(2, 3.3);
  await psu.setChannelCurrent(2, 0.5);
  await psu.setChannelOutput(2, true);
  assert.deepEqual(port.writes, [
    ":SOURce2:VOLTage 3.3",
    ":SOURce2:CURRent 0.5",
    ":OUTPut:STATe CH2,ON",
  ]);
});

test("DP900 pairing: advertises OFF/SER/PAR and round-trips the SCPI query", async () => {
  const psu = new RigolDp900(
    new FakeScpiPort().onQuery(/^:PAIR\?$/, "SER"),
    parseIdn("RIGOL,DP932E,SN,FW"),
  );
  assert.deepEqual(psu.pairing?.modes, ["off", "series", "parallel"]);
  assert.deepEqual(psu.pairing?.channels, [1, 2]);
  assert.equal(await psu.getPairingMode!(), "series");
});

test("DP900 setPairingMode emits :PAIR with the abbreviated argument", async () => {
  const port = new FakeScpiPort();
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  await psu.setPairingMode!("parallel");
  await psu.setPairingMode!("off");
  assert.deepEqual(port.writes, [":PAIR PAR", ":PAIR OFF"]);
});

test("DM858 setMode sends the matching CONFigure command", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setMode("dcVoltage");
  await dmm.setMode("resistance");
  await dmm.setMode("frequency");
  assert.deepEqual(port.writes, [
    ":CONFigure:VOLTage:DC AUTO",
    ":CONFigure:RESistance AUTO",
    ":CONFigure:FREQuency",
  ]);
});

test("DM858 read returns value, unit, and overload flag", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:READ\?/, "1.234560E+00")
    .onQuery(/:FUNCtion\?/, '"VOLT"');
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const reading = await dmm.read();
  assert.equal(reading.mode, "dcVoltage");
  assert.equal(reading.unit, "V");
  assert.ok(Math.abs(reading.value - 1.23456) < 1e-9);
  assert.equal(reading.overload, false);
});

test("DM858 read flags overload when instrument returns 9.9E37 sentinel", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:READ\?/, "9.90000000E+37")
    .onQuery(/:FUNCtion\?/, '"RES"');
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const reading = await dmm.read();
  assert.equal(reading.overload, true);
  assert.ok(Number.isNaN(reading.value));
  assert.equal(reading.mode, "resistance");
});
