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

test("default registry resolves known DHO variants to per-SKU ids", () => {
  const registry = createDefaultRegistry();
  const idn = parseIdn("RIGOL TECHNOLOGIES,DHO804,DHO8A1234567,00.01.03");
  const entry = registry.resolve(idn);
  assert.ok(entry);
  assert.equal(entry!.id, "rigol-dho804");
  assert.equal(entry!.kind, "oscilloscope");
});

test("default registry resolves DP932E and DM858 to per-SKU ids", () => {
  const registry = createDefaultRegistry();
  const psu = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DP932E,SN,FW"));
  const dmm = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DM858,SN,FW"));
  assert.equal(psu?.id, "rigol-dp932e");
  assert.equal(dmm?.id, "rigol-dm858");
});

test("default registry falls back to catch-all for unknown family variants", () => {
  const registry = createDefaultRegistry();
  // A hypothetical new DHO variant still hits the catch-all by family regex.
  const scope = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DHO888,SN,FW"));
  assert.equal(scope?.id, "rigol-dho800");
  const psu = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DP955,SN,FW"));
  assert.equal(psu?.id, "rigol-dp900");
  const dmm = registry.resolve(parseIdn("RIGOL TECHNOLOGIES,DM899,SN,FW"));
  assert.equal(dmm?.id, "rigol-dm800");
});

test("default registry returns null for unsupported vendors", () => {
  const registry = createDefaultRegistry();
  // Pick a vendor that is genuinely not covered by any driver pack yet.
  const idn = parseIdn("YOKOGAWA,DLM5058,SN,FW");
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

test("DP900 pairing: advertises modes and parses :OUTPut:PAIR? reply", async () => {
  const psu = new RigolDp900(
    new FakeScpiPort().onQuery(/^:OUTPut:PAIR\?$/, "SERIES"),
    parseIdn("RIGOL,DP932E,SN,FW"),
  );
  assert.deepEqual(psu.pairing?.modes, ["off", "series", "parallel"]);
  assert.deepEqual(psu.pairing?.channels, [1, 2]);
  assert.equal(await psu.getPairingMode!(), "series");
});

test("DP900 setPairingMode emits :OUTPut:PAIR with the expected argument", async () => {
  const port = new FakeScpiPort();
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  await psu.setPairingMode!("parallel");
  await psu.setPairingMode!("off");
  assert.deepEqual(port.writes, [":OUTPut:PAIR PARallel", ":OUTPut:PAIR OFF"]);
});

test("DP900 advertises protection, tracking, and preset capabilities", () => {
  const psu = new RigolDp900(new FakeScpiPort(), parseIdn("RIGOL,DP932E,SN,FW"));
  assert.deepEqual(psu.protection?.channels, [1, 2, 3]);
  assert.equal(psu.protection?.ranges[1]?.ovp.max, 33);
  assert.equal(psu.protection?.ranges[3]?.ovp.max, 6.6);
  assert.deepEqual(psu.tracking?.channels, [1, 2]);
  assert.equal(psu.presets?.slots, 10);
});

test("DP900 getProtection merges state, level, and trip queries", async () => {
  const port = new FakeScpiPort()
    .onQuery(/^:OUTPut:OVP\? CH1$/, "1")
    .onQuery(/^:OUTPut:OVP:VALue\? CH1$/, "12.500")
    .onQuery(/^:OUTPut:OVP:QUES\? CH1$/, "YES");
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  const state = await psu.getProtection!(1, "ovp");
  assert.equal(state.enabled, true);
  assert.equal(state.level, 12.5);
  assert.equal(state.tripped, true);
  assert.equal(state.range.max, 33);
});

test("DP900 protection writes emit the documented SCPI", async () => {
  const port = new FakeScpiPort();
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  await psu.setProtectionEnabled!(2, "ovp", true);
  await psu.setProtectionLevel!(2, "ovp", 8.8);
  await psu.setProtectionEnabled!(1, "ocp", false);
  await psu.clearProtectionTrip!(1, "ocp");
  assert.deepEqual(port.writes, [
    ":OUTPut:OVP CH2,ON",
    ":OUTPut:OVP:VALue CH2,8.8",
    ":OUTPut:OCP CH1,OFF",
    ":OUTPut:OCP:CLEar CH1",
  ]);
});

test("DP900 tracking toggles via :OUTPut:TRACk and parses ON/OFF", async () => {
  const port = new FakeScpiPort().onQuery(/^:OUTPut:TRACk\?$/, "1");
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  assert.equal(await psu.getTracking!(), true);
  await psu.setTracking!(false);
  await psu.setTracking!(true);
  assert.deepEqual(port.writes, [":OUTPut:TRACk OFF", ":OUTPut:TRACk ON"]);
});

test("DP900 presets save/recall and catalog query", async () => {
  // Only slot 2 and slot 7 are occupied in this fake catalog.
  const occupiedSlots = new Set([2, 7]);
  const port = new FakeScpiPort().onQuery(
    /^:MEMory:VALid\? RIGOL(\d)\.RSF$/,
    (cmd) => {
      const match = /RIGOL(\d)\.RSF/.exec(cmd);
      const slot = Number(match?.[1] ?? "-1");
      return occupiedSlots.has(slot) ? "1" : "0";
    },
  );
  const psu = new RigolDp900(port, parseIdn("RIGOL,DP932E,SN,FW"));
  const catalog = await psu.getPresetCatalog!();
  assert.equal(catalog.length, 10);
  assert.equal(catalog[2], true);
  assert.equal(catalog[7], true);
  assert.equal(catalog[0], false);
  await psu.savePreset!(5);
  await psu.recallPreset!(2);
  assert.deepEqual(port.writes, ["*SAV 5", "*RCL 2"]);
  await assert.rejects(() => psu.savePreset!(10), /preset slot/);
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

test("DM858 advertises all 2.6 capabilities", () => {
  const dmm = new RigolDm858(new FakeScpiPort(), parseIdn("RIGOL,DM858,SN,FW"));
  assert.ok(dmm.ranging);
  assert.ok(dmm.triggering);
  assert.ok(dmm.math);
  assert.ok(dmm.dualDisplay);
  assert.ok(dmm.logging);
  assert.ok(dmm.temperature);
  assert.ok(dmm.presets);
  assert.ok(dmm.supportedModes.includes("fourWireResistance"));
  assert.ok(dmm.supportedModes.includes("temperature"));
});

test("DM858 setAutoZero and setNplc emit expected SCPI", async () => {
  const port = new FakeScpiPort().onQuery(/:FUNCtion\?/, '"VOLT"');
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setAutoZero!("once");
  await dmm.setNplc!(10);
  assert.ok(port.writes.some((w) => /ZERO:AUTO ONCE/i.test(w)));
  assert.ok(port.writes.some((w) => /NPLC 10/i.test(w)));
});

test("DHO800 advertises all 2.7 capabilities", () => {
  const scope = new RigolDho800(new FakeScpiPort(), parseIdn("RIGOL,DHO804,SN,FW"));
  assert.ok(scope.trigger);
  assert.ok(scope.acquisition);
  assert.ok(scope.measurements);
  assert.ok(scope.cursors);
  assert.ok(scope.math);
  assert.ok(scope.references);
  assert.ok(scope.history);
  assert.ok(scope.display);
  assert.ok(scope.presets);
  assert.ok(scope.decoders);
  assert.equal(scope.presets?.slots, 10);
  assert.ok(scope.measurements!.items.length >= 20);
  assert.deepEqual(scope.decoders!.protocols.slice().sort(), [
    "can",
    "i2c",
    "lin",
    "spi",
    "uart",
  ]);
});

test("DHO800 setTriggerConfig emits SCPI for edge trigger", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setTriggerConfig!({ type: "edge", source: "CH1", slope: "rising", level: 1.2 });
  assert.ok(port.writes.includes(":TRIGger:MODE EDGE"));
  assert.ok(port.writes.includes(":TRIGger:EDGE:SOURce CH1"));
  assert.ok(port.writes.includes(":TRIGger:EDGE:SLOPe POSitive"));
  assert.ok(port.writes.includes(":TRIGger:EDGE:LEVel 1.2"));
});

test("DHO800 setAcquisitionConfig emits type + memory depth", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setAcquisitionConfig!({ mode: "average", averages: 128, memoryDepth: "1M" });
  assert.ok(port.writes.includes(":ACQuire:TYPE AVERages"));
  assert.ok(port.writes.includes(":ACQuire:AVERages 128"));
  assert.ok(port.writes.includes(":ACQuire:MDEPth 1000000"));
});

test("DHO800 channel extras map to SCPI", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setChannelBandwidthLimit!(2, "20M");
  await scope.setChannelInvert!(3, true);
  await scope.setChannelUnit!(1, "A");
  assert.ok(port.writes.includes(":CHANnel2:BWLimit 20M"));
  assert.ok(port.writes.includes(":CHANnel3:INVert ON"));
  assert.ok(port.writes.includes(":CHANnel1:UNITs AMP"));
});

// ---- Extended DM858 coverage (2.6b / 2.6c) ----

test("DM858 getRange returns parsed state for the active mode", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:FUNCtion\?/, '"VOLT"')
    .onQuery(/:SENSe:VOLTage:DC:RANGe\?/, "20")
    .onQuery(/:SENSe:VOLTage:DC:RANGe:AUTO\?/, "0");
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const state = await dmm.getRange!();
  assert.equal(state.mode, "dcVoltage");
  assert.equal(state.upper, 20);
  assert.equal(state.auto, false);
});

test("DM858 setRange handles auto and explicit ranges", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setRange!("dcVoltage", "auto");
  await dmm.setRange!("dcVoltage", 20);
  assert.ok(port.writes.includes(":SENSe:VOLTage:DC:RANGe:AUTO ON"));
  assert.ok(port.writes.includes(":SENSe:VOLTage:DC:RANGe:AUTO OFF"));
  assert.ok(port.writes.includes(":SENSe:VOLTage:DC:RANGe 20"));
  await assert.rejects(() => dmm.setRange!("dcVoltage", -1), /invalid range/);
});

test("DM858 getTriggerConfig parses all trigger fields", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:TRIGger:SOURce\?/, "EXT")
    .onQuery(/:TRIGger:SLOPe\?/, "NEG")
    .onQuery(/:TRIGger:DELay\?/, "0.1")
    .onQuery(/:SAMPle:COUNt\?/, "42");
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const cfg = await dmm.getTriggerConfig!();
  assert.equal(cfg.source, "external");
  assert.equal(cfg.slope, "negative");
  assert.ok(Math.abs(cfg.delaySec - 0.1) < 1e-9);
  assert.equal(cfg.sampleCount, 42);
});

test("DM858 setTriggerConfig + trigger emit expected SCPI", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setTriggerConfig!({
    source: "immediate",
    slope: "positive",
    delaySec: 0.25,
    sampleCount: 5,
  });
  await dmm.trigger!();
  assert.ok(port.writes.includes(":TRIGger:SOURce IMMediate"));
  assert.ok(port.writes.includes(":TRIGger:SLOPe POSitive"));
  assert.ok(port.writes.includes(":TRIGger:DELay 0.25"));
  assert.ok(port.writes.includes(":SAMPle:COUNt 5"));
  assert.ok(port.writes.includes("*TRG"));
});

test("DM858 setMath disables with 'none' and configures NULL offset", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setMath!({ function: "null", nullOffset: 0.25 });
  assert.ok(port.writes.includes(":CALCulate:FUNCtion NULL"));
  assert.ok(port.writes.includes(":CALCulate:STATe ON"));
  assert.ok(port.writes.includes(":CALCulate:NULL:OFFSet 0.25"));
  await dmm.setMath!({ function: "none" });
  assert.ok(port.writes.includes(":CALCulate:STATe OFF"));
});

test("DM858 setMath dbm/limit writes reference and bounds", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setMath!({ function: "dbm", dbmReference: 600 });
  await dmm.setMath!({ function: "limit", limitUpper: 5, limitLower: 1 });
  assert.ok(port.writes.includes(":CALCulate:FUNCtion DBM"));
  assert.ok(port.writes.includes(":CALCulate:DBM:REFerence 600"));
  assert.ok(port.writes.includes(":CALCulate:FUNCtion LIMit"));
  assert.ok(port.writes.includes(":CALCulate:LIMit:UPPer 5"));
  assert.ok(port.writes.includes(":CALCulate:LIMit:LOWer 1"));
});

test("DM858 getMath returns 'none' when CALCulate:STATe is off", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:CALCulate:STATe\?/, "0")
    .onQuery(/:CALCulate:FUNCtion\?/, '"NULL"');
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const state = await dmm.getMath!();
  assert.equal(state.config.function, "none");
});

test("DM858 getMath surfaces stats when function = AVERage", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:CALCulate:STATe\?/, "1")
    .onQuery(/:CALCulate:FUNCtion\?/, '"AVERage"')
    .onQuery(/:CALCulate:AVERage:MINimum\?/, "1.0")
    .onQuery(/:CALCulate:AVERage:MAXimum\?/, "5.0")
    .onQuery(/:CALCulate:AVERage:AVERage\?/, "3.0")
    .onQuery(/:CALCulate:AVERage:SDEViation\?/, "0.5")
    .onQuery(/:CALCulate:AVERage:COUNt\?/, "10");
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const state = await dmm.getMath!();
  assert.equal(state.config.function, "stats");
  assert.ok(state.stats);
  assert.equal(state.stats!.count, 10);
  assert.equal(state.stats!.average, 3.0);
});

test("DM858 resetMathStatistics clears CALCulate:AVERage", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.resetMathStatistics!();
  assert.deepEqual(port.writes, [":CALCulate:AVERage:CLEar"]);
});

test("DM858 setDualDisplay toggles window 2 on/off", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setDualDisplay!("frequency");
  await dmm.setDualDisplay!(null);
  assert.ok(port.writes.includes(":DISPlay:WINDow2:FUNCtion FREQ"));
  assert.ok(port.writes.includes(":DISPlay:WINDow2:STATe ON"));
  assert.ok(port.writes.includes(":DISPlay:WINDow2:STATe OFF"));
});

test("DM858 getTemperatureConfig decodes unit + transducer", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:UNIT:TEMPerature\?/, "F")
    .onQuery(/:SENSe:TEMPerature:TRANsducer:TYPE\?/, "TCouple,K");
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const cfg = await dmm.getTemperatureConfig!();
  assert.equal(cfg.unit, "fahrenheit");
  assert.equal(cfg.transducer, "thermocouple-k");
});

test("DM858 setTemperatureConfig emits unit + two-step transducer SCPI", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.setTemperatureConfig!({ unit: "celsius", transducer: "pt1000" });
  assert.ok(port.writes.includes(":UNIT:TEMPerature C"));
  // DM858 accepts family + sub-type as two writes, not comma-joined.
  assert.ok(port.writes.includes(":SENSe:TEMPerature:TRANsducer:TYPE RTD"));
  assert.ok(port.writes.includes(":SENSe:TEMPerature:TRANsducer:RTD:TYPE PT1000"));

  const tcPort = new FakeScpiPort();
  const tcDmm = new RigolDm858(tcPort, parseIdn("RIGOL,DM858,SN,FW"));
  await tcDmm.setTemperatureConfig!({ unit: "celsius", transducer: "thermocouple-k" });
  assert.ok(tcPort.writes.includes(":SENSe:TEMPerature:TRANsducer:TYPE TCouple"));
  assert.ok(tcPort.writes.includes(":SENSe:TEMPerature:TRANsducer:TCouple:TYPE K"));
});

test("DM858 preset save/recall emit *SAV / *RCL and validate slot range", async () => {
  const port = new FakeScpiPort();
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const catalog = await dmm.getPresetCatalog!();
  assert.equal(catalog.length, 10);
  await dmm.savePreset!(3);
  await dmm.recallPreset!(3);
  assert.ok(port.writes.includes("*SAV 3"));
  assert.ok(port.writes.includes("*RCL 3"));
  await assert.rejects(() => dmm.savePreset!(10), /preset slot/);
  await assert.rejects(() => dmm.recallPreset!(-1), /preset slot/);
});

test("DM858 logging: start, status, samples, stop", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:READ\?/, "1.5")
    .onQuery(/:FUNCtion\?/, '"VOLT"');
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  const run = await dmm.startLogging!({ intervalMs: 50, totalSamples: 3 });
  assert.ok(run.runId);
  // Allow the interval timer to fire a few times.
  await new Promise((r) => setTimeout(r, 250));
  const status = await dmm.getLoggingStatus!();
  assert.ok(status.samplesEmitted >= 1);
  const samples = await dmm.fetchLoggedSamples!(run.runId, 0);
  assert.ok(samples.length >= 1);
  assert.equal(samples[0]!.mode, "dcVoltage");
  await dmm.stopLogging!();
  const after = await dmm.getLoggingStatus!();
  assert.equal(after.running, false);
});

test("DM858 logging rejects a second concurrent run", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:READ\?/, "1")
    .onQuery(/:FUNCtion\?/, '"VOLT"');
  const dmm = new RigolDm858(port, parseIdn("RIGOL,DM858,SN,FW"));
  await dmm.startLogging!({ intervalMs: 50 });
  await assert.rejects(() => dmm.startLogging!({ intervalMs: 50 }), /already active/);
  await dmm.stopLogging!();
});

// ---- Extended DHO800 coverage (2.7b / 2.7c / 2.7d) ----

test("DHO800 trigger config covers pulse / slope / timeout / nthEdge", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setTriggerConfig!({
    type: "pulse",
    source: "CH2",
    polarity: "positive",
    condition: "greaterThan",
    level: 0.5,
  });
  await scope.setTriggerConfig!({
    type: "slope",
    source: "CH1",
    slope: "rising",
    condition: "greaterThan",
    upperLevel: 1,
    lowerLevel: -1,
  });
  await scope.setTriggerConfig!({
    type: "timeout",
    source: "CH3",
    slope: "rising",
    timeout: 1e-3,
    level: 0.2,
  });
  await scope.setTriggerConfig!({
    type: "nthEdge",
    source: "CH4",
    slope: "rising",
    idle: 1e-6,
    edgeCount: 5,
    level: 0.2,
  });
  const writes = port.writes;
  assert.ok(writes.includes(":TRIGger:MODE PULSe"));
  assert.ok(writes.includes(":TRIGger:PULSe:SOURce CH2"));
  assert.ok(writes.includes(":TRIGger:MODE SLOPe"));
  assert.ok(writes.includes(":TRIGger:SLOPe:ALEVel 1"));
  assert.ok(writes.includes(":TRIGger:SLOPe:BLEVel -1"));
  assert.ok(writes.includes(":TRIGger:MODE TIMeout"));
  assert.ok(writes.includes(":TRIGger:TIMeout:TIME 0.001"));
  assert.ok(writes.includes(":TRIGger:MODE NEDGe"));
  assert.ok(writes.includes(":TRIGger:NEDGe:EDGE 5"));
});

test("DHO800 sweep + force trigger emit SCPI", async () => {
  const port = new FakeScpiPort().onQuery(/:TRIGger:SWEep\?/, "NORM");
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  assert.equal(await scope.getSweep!(), "normal");
  await scope.setSweep!("single");
  await scope.forceTrigger!();
  assert.ok(port.writes.includes(":TRIGger:SWEep SINGle"));
  assert.ok(port.writes.includes(":TFORce"));
});

test("DHO800 acquisition get/run/stop/autoset", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:ACQuire:TYPE\?/, "AVERages")
    .onQuery(/:ACQuire:AVERages\?/, "64")
    .onQuery(/:ACQuire:MDEPth\?/, "1000000");
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  const cfg = await scope.getAcquisitionConfig!();
  assert.equal(cfg.mode, "average");
  assert.equal(cfg.averages, 64);
  assert.equal(cfg.memoryDepth, "1M");
  await scope.run!();
  await scope.stop!();
  await scope.autoset!();
  assert.ok(port.writes.includes(":RUN"));
  assert.ok(port.writes.includes(":STOP"));
  assert.ok(port.writes.includes(":AUToset"));
});

test("DHO800 setMeasurements emits MEASure:ITEM per selection and clearStats works", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setMeasurements!([
    { id: "vpp", source: "CH1" },
    { id: "frequency", source: "CH2" },
  ]);
  await scope.clearMeasurementStatistics!();
  assert.ok(port.writes.some((w) => /:MEASure:ITEM VPP,CH1/.test(w)));
  assert.ok(port.writes.some((w) => /:MEASure:ITEM FREQuency,CH2/.test(w)));
  assert.ok(port.writes.includes(":MEASure:STATistic:RESet"));
});

test("DHO800 getMeasurements queries per-selection values", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:MEASure:ITEM\? VPP,CH1/, "1.234")
    .onQuery(/:MEASure:ITEM\? FREQuency,CH2/, "1.0E+3");
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setMeasurements!([
    { id: "vpp", source: "CH1" },
    { id: "frequency", source: "CH2" },
  ]);
  const results = await scope.getMeasurements!();
  assert.equal(results.length, 2);
  assert.equal(results[0]!.value, 1.234);
  assert.equal(results[0]!.unit, "V");
  assert.equal(results[1]!.value, 1000);
  assert.equal(results[1]!.unit, "Hz");
});

test("DHO800 cursors: manual mode writes positions and getCursors reads them back", async () => {
  const port = new FakeScpiPort()
    .onQuery(/:CURSor:MANual:AX\?/, "0.001")
    .onQuery(/:CURSor:MANual:BX\?/, "0.002")
    .onQuery(/:CURSor:MANual:AY\?/, "0.1")
    .onQuery(/:CURSor:MANual:BY\?/, "0.3");
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setCursors!({ mode: "manual", axis: "x", aX: 0.001, bX: 0.002 });
  const state = await scope.getCursors!();
  assert.equal(state.config.mode, "manual");
  assert.ok(port.writes.includes(":CURSor:MODE MANual"));
  assert.ok(port.writes.includes(":CURSor:MANual:AX 0.001"));
  assert.ok(port.writes.includes(":CURSor:MANual:BX 0.002"));
  assert.ok(state.readout.deltaX !== undefined);
  assert.ok(Math.abs(state.readout.deltaX! - 0.001) < 1e-9);
  assert.ok(state.readout.inverseDeltaX !== undefined);
});

test("DHO800 math config writes operator + sources, FFT adds window/span/center", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setMathConfig!({
    enabled: true,
    operator: "fft",
    source1: "CH1",
    fft: { window: "hanning", span: 1e6, center: 5e5 },
  });
  assert.ok(port.writes.includes(":MATH:OPERator FFT"));
  assert.ok(port.writes.includes(":MATH:SOURce1 CH1"));
  assert.ok(port.writes.includes(":MATH:DISPlay ON"));
  assert.ok(port.writes.includes(":MATH:FFT:WINDow HANN"));
  assert.ok(port.writes.includes(":MATH:FFT:SPAN 1000000"));
  assert.ok(port.writes.includes(":MATH:FFT:CENTer 500000"));
});

test("DHO800 references save + enable toggle tracks slot state", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.saveReference!(0, "CH1");
  await scope.setReferenceEnabled!(0, true);
  const slots = await scope.getReferenceSlots!();
  assert.equal(slots[0]!.enabled, true);
  assert.equal(slots[0]!.source, "CH1");
  assert.ok(port.writes.includes(":REFerence:CURRent REF1"));
  assert.ok(port.writes.includes(":REFerence:SOURce CH1"));
  assert.ok(port.writes.includes(":REFerence:SAVE"));
  assert.ok(port.writes.includes(":REFerence:REF1:DISPlay ON"));
});

test("DHO800 history toggles enable + frame + playback", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setHistoryEnabled!(true);
  await scope.setHistoryFrame!(42);
  await scope.setHistoryPlayback!(true);
  const state = await scope.getHistoryState!();
  assert.equal(state.enabled, true);
  assert.equal(state.currentFrame, 42);
  assert.equal(state.playing, true);
  assert.ok(port.writes.includes(":HISTory:DISPlay ON"));
  assert.ok(port.writes.includes(":HISTory:FRAMe 42"));
  assert.ok(port.writes.includes(":HISTory:PLAY ON"));
});

test("DHO800 display persistence + screenshot capture", async () => {
  const body = new Uint8Array([1, 2, 3]);
  const port = new FakeScpiPort().onQuery(/:DISPlay:DATA\? PNG/, body);
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setDisplayPersistence!("infinite");
  assert.equal(await scope.getDisplayPersistence!(), "infinite");
  const shot = await scope.captureScreenshot!("png");
  assert.equal(shot.format, "png");
  assert.deepEqual(Array.from(shot.data), [1, 2, 3]);
  assert.ok(port.writes.includes(":DISPlay:GRADing:TIME INFinite"));
});

test("DHO800 presets: save records occupancy and recall emits *RCL", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.savePreset!(4);
  const catalog = await scope.getPresetCatalog!();
  assert.equal(catalog[4], true);
  assert.equal(catalog[5], false);
  await scope.recallPreset!(4);
  assert.ok(port.writes.includes("*SAV 4"));
  assert.ok(port.writes.includes("*RCL 4"));
});

test("DHO800 decoder setDecoder configures I2C and stores state", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setDecoder!(1, {
    protocol: "i2c",
    sclSource: "CH1",
    sdaSource: "CH2",
    addressMode: "7bit",
  });
  const buses = await scope.getDecoders!();
  assert.equal(buses[0]!.enabled, true);
  assert.equal(buses[0]!.config?.protocol, "i2c");
  assert.ok(port.writes.includes(":BUS1:MODE IIC"));
  assert.ok(port.writes.includes(":BUS1:IIC:SCLK:SOURce CH1"));
  assert.ok(port.writes.includes(":BUS1:IIC:SDA:SOURce CH2"));
  assert.ok(port.writes.includes(":BUS1:DISPlay ON"));
});

test("DHO800 decoder setDecoder(null) disables the bus", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  await scope.setDecoder!(2, {
    protocol: "uart",
    txSource: "CH1",
    rxSource: "CH2",
    baud: 115200,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    polarity: "positive",
  });
  await scope.setDecoder!(2, null);
  assert.ok(port.writes.includes(":BUS2:MODE RS232"));
  assert.ok(port.writes.includes(":BUS2:RS232:TX:SOURce CH1"));
  assert.ok(port.writes.includes(":BUS2:RS232:BAUD 115200"));
  assert.ok(port.writes.includes(":BUS2:DISPlay OFF"));
  const buses = await scope.getDecoders!();
  assert.equal(buses[1]!.enabled, false);
  assert.equal(buses[1]!.config, null);
});

test("DHO800 fetchDecoderPackets returns empty list for unused bus", async () => {
  const port = new FakeScpiPort();
  const scope = new RigolDho800(port, parseIdn("RIGOL,DHO804,SN,FW"));
  const packets = await scope.fetchDecoderPackets!(1);
  assert.deepEqual(packets, []);
});
