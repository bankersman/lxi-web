import test from "node:test";
import assert from "node:assert/strict";
import { parseDm800PresetCatalog } from "../src/drivers/rigol/dm800-presets.js";

test("parseDm800PresetCatalog: empty and whitespace → all false", () => {
  assert.deepEqual(parseDm800PresetCatalog("", 10), Array(10).fill(false));
  assert.deepEqual(parseDm800PresetCatalog("   ", 10), Array(10).fill(false));
});

test("parseDm800PresetCatalog: minimal header only → all false", () => {
  assert.deepEqual(parseDm800PresetCatalog("0,1000000", 10), Array(10).fill(false));
});

test("parseDm800PresetCatalog: single STAT row marks slot", () => {
  const raw = '0,1000000,"state3.sta,STAT,1234"';
  const got = parseDm800PresetCatalog(raw, 10);
  assert.equal(got[3], true);
  assert.equal(got.filter(Boolean).length, 1);
});

test("parseDm800PresetCatalog: ignores non-STAT property", () => {
  const raw = '0,1000000,"foo.csv,ASC,99","state1.sta,STAT,500"';
  const got = parseDm800PresetCatalog(raw, 10);
  assert.equal(got[1], true);
  assert.equal(got[0], false);
});

test("parseDm800PresetCatalog: multiple slots", () => {
  const raw =
    '0,1000000,"state0.sta,STAT,1","state9.sta,STAT,2","other.sta,STAT,3"';
  const got = parseDm800PresetCatalog(raw, 10);
  assert.equal(got[0], true);
  assert.equal(got[9], true);
  assert.equal(got[1], false);
});

test("parseDm800PresetCatalog: slot index out of range ignored", () => {
  const raw = '0,1000000,"state99.sta,STAT,1"';
  const got = parseDm800PresetCatalog(raw, 10);
  assert.deepEqual(got, Array(10).fill(false));
});
