import test from "node:test";
import assert from "node:assert/strict";
import {
  SAFE_MODE_WRITE_TITLE,
  mergeWriteGate,
} from "../src/lib/safeModeWriteBind.ts";

test("mergeWriteGate: own disabled only", () => {
  const g = mergeWriteGate(true, false);
  assert.equal(g.disabled, true);
  assert.equal(g["aria-disabled"], true);
  assert.equal(g.title, "");
});

test("mergeWriteGate: safe mode sets title and disables", () => {
  const g = mergeWriteGate(false, true);
  assert.equal(g.disabled, true);
  assert.equal(g["aria-disabled"], true);
  assert.equal(g.title, SAFE_MODE_WRITE_TITLE);
});

test("mergeWriteGate: safe mode wins when own already disabled", () => {
  const g = mergeWriteGate(true, true);
  assert.equal(g.disabled, true);
  assert.equal(g.title, SAFE_MODE_WRITE_TITLE);
});

test("mergeWriteGate: neither", () => {
  const g = mergeWriteGate(false, false);
  assert.equal(g.disabled, false);
  assert.equal(g["aria-disabled"], false);
  assert.equal(g.title, "");
});
