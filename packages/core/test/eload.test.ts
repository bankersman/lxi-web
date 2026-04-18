import test from "node:test";
import assert from "node:assert/strict";
import {
  DL3000_VARIANTS,
  RigolDl3000,
  createDefaultRegistry,
  parseIdn,
} from "../src/index.js";
import { FakeScpiPort } from "./helpers/fake-port.js";

const IDENTITY = {
  manufacturer: "rigol",
  manufacturerRaw: "RIGOL TECHNOLOGIES",
  model: "DL3021",
  serial: "SIM000000",
  firmware: "00.01.05",
  raw: "RIGOL TECHNOLOGIES,DL3021,SIM000000,00.01.05",
};

function wireDl3000(port: FakeScpiPort): void {
  port.onQuery(/^\*IDN\?/, IDENTITY.raw);
  port.onQuery(/^\*OPT\?/, "0");
  port.onQuery(/^:SOURce:INPut:STATe\?/, "OFF");
  port.onQuery(/^:SOURce:FUNCtion\?/, "CURR");
  port.onQuery(/^:SOURce:CURRent:LEVel:IMMediate\?/, "1.5");
  port.onQuery(/^:SOURce:VOLTage:LEVel:IMMediate\?/, "5.0");
  port.onQuery(/^:SOURce:RESistance:LEVel:IMMediate\?/, "100");
  port.onQuery(/^:SOURce:POWer:LEVel:IMMediate\?/, "10");
  port.onQuery(/^:MEASure:VOLTage\?/, "12.0");
  port.onQuery(/^:MEASure:CURRent\?/, "1.5");
  port.onQuery(/^:MEASure:POWer\?/, "18.0");
  port.onQuery(/^:MEASure:RESistance\?/, "8.0");
  port.onQuery(/^:SOURce:VOLTage:PROTection:STATe\?/, "ON");
  port.onQuery(/^:SOURce:VOLTage:PROTection:LEVel\?/, "150");
  port.onQuery(/^:SOURce:VOLTage:PROTection:TRIPped\?/, "0");
  port.onQuery(/^:SYSTem:OTP\?/, "0");
}

test("RigolDl3000 advertises capability set from profile", () => {
  const port = new FakeScpiPort();
  const driver = new RigolDl3000(port, IDENTITY, DL3000_VARIANTS[0]);
  assert.equal(driver.kind, "electronicLoad");
  assert.equal(driver.limits.voltageMax, 150);
  assert.equal(driver.limits.currentMax, 40);
  assert.equal(driver.limits.powerMax, 200);
  assert.ok(driver.protection);
  assert.deepEqual(
    [...driver.protection.kinds].sort(),
    ["ocp", "opp", "otp", "ovp"],
  );
  assert.ok(driver.dynamic);
  assert.ok(driver.battery);
  assert.equal(driver.presets.slots, 10);
});

test("RigolDl3000 getState wires SCPI reads into a typed snapshot", async () => {
  const port = new FakeScpiPort();
  wireDl3000(port);
  const driver = new RigolDl3000(port, IDENTITY);
  const state = await driver.getState();
  assert.equal(state.enabled, false);
  assert.equal(state.mode, "cc");
  assert.equal(state.setpoints.cc, 1.5);
  assert.equal(state.measurement.voltage, 12);
  assert.equal(state.limits.currentMax, DL3000_VARIANTS[0].currentMax);
});

test("RigolDl3000 setSetpoint validates against profile", async () => {
  const port = new FakeScpiPort();
  const driver = new RigolDl3000(port, IDENTITY, DL3000_VARIANTS[0]);
  await driver.setSetpoint("cc", 10);
  assert.ok(
    port.writes.some((w) => w === ":SOURce:CURRent:LEVel:IMMediate 10"),
    `writes: ${port.writes.join("|")}`,
  );
  await assert.rejects(
    () => driver.setSetpoint("cc", 99),
    /CC 99 > 40A/,
  );
  await assert.rejects(() => driver.setSetpoint("cv", 200), /CV 200 > 150V/);
  await assert.rejects(() => driver.setSetpoint("cp", 1000), /CP 1000 > 200W/);
  await assert.rejects(() => driver.setSetpoint("cr", 0), /CR 0 outside/);
});

test("RigolDl3000 protection is gated per-kind", async () => {
  const port = new FakeScpiPort();
  wireDl3000(port);
  const driver = new RigolDl3000(port, IDENTITY, DL3000_VARIANTS[0]);
  const ovp = await driver.getProtection!("ovp");
  assert.equal(ovp.enabled, true);
  assert.equal(ovp.level, 150);
  const otp = await driver.getProtection!("otp");
  assert.equal(otp.enabled, true);
  await assert.rejects(
    () => driver.setProtectionEnabled!("otp", false),
    /OTP is always enabled/,
  );
  await assert.rejects(
    () => driver.setProtectionLevel!("ovp", 999),
    /OVP level 999 outside/,
  );
});

test("registry resolves DL3000 variants to variant-specific entries", () => {
  const registry = createDefaultRegistry();
  for (const variant of DL3000_VARIANTS) {
    const parsed = parseIdn(
      `RIGOL TECHNOLOGIES,${variant.variant},SN,FW`,
    );
    const entry = registry.resolve(parsed);
    assert.ok(entry, `resolve ${variant.variant}`);
    assert.equal(entry!.id, `rigol-${variant.variant.toLowerCase()}`);
    assert.equal(entry!.kind, "electronicLoad");
    const driver = entry!.create(new FakeScpiPort(), parsed) as RigolDl3000;
    assert.equal(driver.profile.variant, variant.variant);
  }
});

test("registry falls back to generic rigol-dl3000 for unknown DL31xx variants", () => {
  const registry = createDefaultRegistry();
  const parsed = parseIdn("RIGOL TECHNOLOGIES,DL3099,SN,FW");
  const entry = registry.resolve(parsed);
  assert.ok(entry);
  assert.equal(entry!.id, "rigol-dl3000");
  assert.equal(entry!.kind, "electronicLoad");
});
