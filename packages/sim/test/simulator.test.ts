import test from "node:test";
import assert from "node:assert/strict";
import { Simulator } from "../src/simulator.js";
import { SimulatorSession, runLines } from "../src/session.js";
import { parseCommand } from "../src/command.js";
import { encodeIeee488Block } from "../src/handlers/ieee488-block.js";
import { genericUnknownPersonality } from "../personalities/generic-unknown.js";
import { rigolDho804Personality } from "../personalities/rigol/dho804.js";
import { rigolDp932ePersonality } from "../personalities/rigol/dp932e.js";
import { rigolDm858Personality } from "../personalities/rigol/dm858.js";
import { createDefaultPersonalityRegistry } from "../personalities/index.js";

test("parseCommand normalises queries and arguments", () => {
  const q = parseCommand(":CHANnel1:SCALe?");
  assert.equal(q.header, ":CHANNEL1:SCALE?");
  assert.equal(q.normalized, "CHANNEL1:SCALE?");
  assert.equal(q.isQuery, true);
  assert.deepEqual(q.args, []);

  const w = parseCommand("*IDN  "); // trailing whitespace
  assert.equal(w.normalized, "*IDN");
  assert.equal(w.isQuery, false);

  const v = parseCommand(":CHAN1:SCAL 0.5,AC");
  assert.deepEqual(v.args, ["0.5", "AC"]);
  assert.equal(v.isQuery, false);
});

test("IEEE 488.2 block encoder emits well-formed headers", () => {
  const payload = new Uint8Array([1, 2, 3, 4]);
  const encoded = encodeIeee488Block(payload);
  const header = new TextDecoder().decode(encoded.subarray(0, 3));
  assert.equal(header, "#14");
  assert.deepEqual([...encoded.subarray(3)], [1, 2, 3, 4]);
});

test("session dispatches common *IDN?, *OPT?, SYST:ERR? fallbacks", async () => {
  const session = new SimulatorSession({
    personality: genericUnknownPersonality,
    idn: "ACME INSTRUMENTS,GENERIC-1000,SIM001,1.0.0",
    opt: "",
  });
  const [idn, opt, err1] = await runLines(session, ["*IDN?", "*OPT?", "SYST:ERR?"]);
  assert.deepEqual(idn, { kind: "line", text: "ACME INSTRUMENTS,GENERIC-1000,SIM001,1.0.0" });
  assert.deepEqual(opt, { kind: "line", text: "" });
  assert.deepEqual(err1, { kind: "line", text: `0,"No error"` });
});

test("unknown command pushes -113 and returns empty line for queries", async () => {
  const session = new SimulatorSession({
    personality: genericUnknownPersonality,
    idn: "A,B,C,D",
    opt: "",
  });
  const [unknownQuery, err] = await runLines(session, [
    ":FOOBAR:BAZ?",
    "SYST:ERR?",
  ]);
  assert.deepEqual(unknownQuery, { kind: "line", text: "" });
  assert.equal(err.kind, "line");
  if (err.kind === "line") {
    assert.match(err.text, /^-113,"Undefined header/);
  }
});

test("fixture responses cover static DHO804 queries", async () => {
  const session = new SimulatorSession({
    personality: rigolDho804Personality,
    idn: rigolDho804Personality.idn,
    opt: rigolDho804Personality.opt ?? "",
  });
  const [scale, offset, opt] = await runLines(session, [
    ":TIMebase:MAIN:SCALe?",
    ":TIMebase:MAIN:OFFSet?",
    "*OPT?",
  ]);
  assert.equal(scale.kind, "line");
  if (scale.kind === "line") assert.match(scale.text, /1\.0+E-03/);
  assert.equal(offset.kind, "line");
  if (offset.kind === "line") assert.match(offset.text, /0\.0+E\+00/);
  assert.equal(opt.kind, "line");
  if (opt.kind === "line") assert.ok(opt.text.includes("SD-I2C"));
});

test("DHO804 channel setter round-trips through state", async () => {
  const session = new SimulatorSession({
    personality: rigolDho804Personality,
    idn: rigolDho804Personality.idn,
    opt: rigolDho804Personality.opt ?? "",
  });
  await session.handleLine(":CHANnel1:SCALe 0.5");
  const read = await session.handleLine(":CHANnel1:SCALe?");
  assert.equal(read.kind, "line");
  if (read.kind === "line") assert.equal(read.text, "0.5");
});

test("DHO804 WAVeform:DATA? returns a definite-length block", async () => {
  const session = new SimulatorSession({
    personality: rigolDho804Personality,
    idn: rigolDho804Personality.idn,
    opt: rigolDho804Personality.opt ?? "",
  });
  const r = await session.handleLine(":WAVeform:DATA?");
  assert.equal(r.kind, "binary");
  if (r.kind !== "binary") return;
  const header = new TextDecoder().decode(r.bytes.subarray(0, 6));
  assert.match(header, /^#4\d{4}/);
});

test("DP932E voltage/current setters echo to MEAS?", async () => {
  const session = new SimulatorSession({
    personality: rigolDp932ePersonality,
    idn: rigolDp932ePersonality.idn,
    opt: "",
  });
  await session.handleLine(":SOURce1:VOLTage 3.30");
  await session.handleLine(":OUTPut1:STATe ON");
  const vread = await session.handleLine(":MEASure:VOLTage? CH1");
  assert.equal(vread.kind, "line");
  if (vread.kind === "line") {
    assert.ok(Number.parseFloat(vread.text) > 3 && Number.parseFloat(vread.text) < 3.4);
  }
});

test("DM858 MEASure:VOLTage:DC? produces a number on each call", async () => {
  const session = new SimulatorSession({
    personality: rigolDm858Personality,
    idn: rigolDm858Personality.idn,
    opt: "",
  });
  const [a, b] = await runLines(session, [
    ":MEASure:VOLTage:DC?",
    ":MEASure:VOLTage:DC?",
  ]);
  assert.equal(a.kind, "line");
  assert.equal(b.kind, "line");
  if (a.kind !== "line" || b.kind !== "line") return;
  assert.ok(Number.isFinite(Number.parseFloat(a.text)));
  assert.ok(Number.isFinite(Number.parseFloat(b.text)));
});

test("TCP simulator serves *IDN? to a real socket", async () => {
  const sim = new Simulator({ personality: rigolDho804Personality });
  await sim.listen({ host: "127.0.0.1", port: 0 });
  const { createConnection } = await import("node:net");
  const socket = createConnection({ host: "127.0.0.1", port: sim.port });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });
  socket.write("*IDN?\n");
  const reply = await new Promise<string>((resolve) => {
    socket.once("data", (buf) => resolve(buf.toString("utf8").trim()));
  });
  assert.match(reply, /RIGOL TECHNOLOGIES,DHO804/);
  socket.destroy();
  await sim.close();
});

test("default personality registry ships the full built-in roster", () => {
  const reg = createDefaultPersonalityRegistry();
  const ids = new Set(reg.list().map((p) => p.id));
  assert.ok(ids.has("rigol-dho804"));
  assert.ok(ids.has("rigol-dp932e"));
  assert.ok(ids.has("rigol-dm858"));
  assert.ok(ids.has("rigol-dl3021"));
  assert.ok(ids.has("rigol-dg812"));
  assert.ok(ids.has("rigol-dg932"));
  assert.ok(ids.has("siglent-spd3303x-e"));
  assert.ok(ids.has("siglent-sdm3065x"));
  assert.ok(ids.has("siglent-sds824x-hd"));
  assert.ok(ids.has("siglent-sdl1020x-e"));
  assert.ok(ids.has("siglent-sdg2042x"));
  assert.ok(ids.has("siglent-ssa3032x"));
  assert.ok(ids.has("rigol-rsa3030"));
  assert.ok(ids.has("keysight-33511b"));
  assert.ok(ids.has("keysight-n9320b"));
  assert.ok(ids.has("keysight-edu36311a"));
  assert.ok(ids.has("keysight-e36313a"));
  assert.ok(ids.has("keysight-truevolt-34461a"));
  assert.ok(ids.has("keysight-truevolt-34470a"));
  assert.ok(ids.has("keysight-infiniivision-dsox2024a"));
  assert.ok(ids.has("keysight-infiniivision-dsox3034t"));
  assert.ok(ids.has("keysight-el34243a"));
  assert.ok(ids.has("owon-xdm2041"));
  assert.ok(ids.has("owon-xdm1041"));
  assert.ok(ids.has("owon-spe3103"));
  assert.ok(ids.has("owon-xds3104ae"));
  assert.ok(ids.has("generic-unknown"));
});
