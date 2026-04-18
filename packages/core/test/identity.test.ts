import test from "node:test";
import assert from "node:assert/strict";
import {
  DriverRegistry,
  parseIdn,
  shortIdentity,
  type DriverEntry,
} from "../src/identity/index.js";

test("parseIdn splits standard *IDN? shape", () => {
  const identity = parseIdn("RIGOL TECHNOLOGIES,DHO804,DHO8A000000001,00.01.03");
  assert.equal(identity.manufacturer, "RIGOL TECHNOLOGIES");
  assert.equal(identity.model, "DHO804");
  assert.equal(identity.serial, "DHO8A000000001");
  assert.equal(identity.firmware, "00.01.03");
});

test("parseIdn tolerates trailing whitespace and CRLF", () => {
  const identity = parseIdn("KEYSIGHT,DSOX1204G,MY12345,5.1.0\r\n");
  assert.equal(identity.manufacturer, "KEYSIGHT");
  assert.equal(identity.firmware, "5.1.0");
});

test("parseIdn preserves trailing fields as firmware when extras follow", () => {
  const identity = parseIdn("A,B,C,D,E,F");
  assert.equal(identity.firmware, "D,E,F");
});

test("shortIdentity trims marketing suffixes", () => {
  const identity = parseIdn("RIGOL TECHNOLOGIES,DHO804,SN,FW");
  assert.equal(shortIdentity(identity), "RIGOL DHO804");
});

test("DriverRegistry resolves by substring manufacturer and regex model", () => {
  const registry = new DriverRegistry();
  const entry: DriverEntry = {
    id: "rigol-dho800",
    kind: "oscilloscope",
    match: { manufacturer: "rigol", model: /^DHO8\d{2}$/ },
    create: () => ({ tag: "dho" }),
  };
  registry.register(entry);

  const dho = parseIdn("RIGOL TECHNOLOGIES,DHO804,SN,FW");
  const match = registry.resolve(dho);
  assert.ok(match, "should resolve a driver");
  assert.equal(match!.id, "rigol-dho800");

  const other = parseIdn("KEYSIGHT,DSOX1204G,SN,FW");
  assert.equal(registry.resolve(other), null);
});

test("DriverRegistry rejects duplicate ids", () => {
  const registry = new DriverRegistry();
  const entry: DriverEntry = {
    id: "x",
    kind: "multimeter",
    match: { manufacturer: "x", model: "x" },
    create: () => ({}),
  };
  registry.register(entry);
  assert.throws(() => registry.register(entry), /already registered/);
});
