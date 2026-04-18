import test from "node:test";
import assert from "node:assert/strict";
import {
  ScpiClosedError,
  ScpiProtocolError,
  ScpiSession,
  ScpiTimeoutError,
} from "../src/scpi/index.js";
import { FakeTransport } from "./helpers/fake-transport.js";

test("write appends newline and flushes", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  await s.write("*CLS");
  assert.equal(t.writtenText(), "*CLS\n");
});

test("query returns trimmed line and strips CRLF", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  const pending = s.query("*IDN?");
  setImmediate(() => t.emit("RIGOL TECHNOLOGIES,DHO804,ABC,1.0\r\n"));
  const idn = await pending;
  assert.equal(idn, "RIGOL TECHNOLOGIES,DHO804,ABC,1.0");
  assert.equal(t.writtenText(), "*IDN?\n");
});

test("queries are serialized in FIFO order", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  const first = s.query("A?");
  const second = s.query("B?");
  setImmediate(() => {
    t.emit("1\n");
    t.emit("2\n");
  });
  assert.deepEqual(await Promise.all([first, second]), ["1", "2"]);
});

test("queryBinary parses IEEE 488.2 definite-length block", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  const pending = s.queryBinary(":WAV:DATA?");
  const body = new Uint8Array([10, 20, 30, 40, 50]);
  const header = new TextEncoder().encode(`#1${body.length}`);
  setImmediate(() => {
    t.emit(header);
    t.emit(body);
    t.emit("\n");
  });
  const out = await pending;
  assert.deepEqual(Array.from(out), Array.from(body));
});

test("queryBinary handles multi-digit headers and chunked delivery", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  const body = new Uint8Array(250).map((_, i) => i % 255);
  const pending = s.queryBinary(":WAV:DATA?");
  setImmediate(() => {
    t.emit("#3");
    t.emit(String(body.length));
    t.emit(body.subarray(0, 100));
    setImmediate(() => {
      t.emit(body.subarray(100));
    });
  });
  const out = await pending;
  assert.equal(out.length, body.length);
  assert.deepEqual(Array.from(out.subarray(0, 10)), Array.from(body.subarray(0, 10)));
});

test("query rejects with ScpiTimeoutError when no reply arrives", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  await assert.rejects(s.query("NOPE?", { timeoutMs: 20 }), ScpiTimeoutError);
});

test("close rejects pending queries with ScpiClosedError", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  const pending = s.query("A?");
  await s.close();
  await assert.rejects(pending, ScpiClosedError);
});

test("malformed binary header raises ScpiProtocolError", async () => {
  const t = new FakeTransport();
  const s = new ScpiSession(t);
  const pending = s.queryBinary(":WAV:DATA?");
  setImmediate(() => t.emit("XYZ"));
  await assert.rejects(pending, ScpiProtocolError);
});
