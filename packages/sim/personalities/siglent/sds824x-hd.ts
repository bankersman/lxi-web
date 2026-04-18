import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  SimulatorPersonality,
} from "../../src/personality.js";
import { encodeIeee488Block } from "../../src/handlers/ieee488-block.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "sds824x-hd.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Siglent SDS824X-HD personality — representative of the modern
 * SCPI-2000 HD dialect the `SiglentSdsHd` driver targets. Covers the
 * channel / timebase / trigger / acquire / waveform surface the
 * dashboard exercises on connect and during a capture.
 *
 * Waveform payloads are synthetic 16-bit signed samples — the
 * simulator only cares about round-trip correctness, not scope
 * fidelity, so we emit a shaped sine that the driver decodes through
 * its preamble math into a recognizable trace.
 */

const CHANNEL_COUNT = 4;
const WAVEFORM_POINTS = 1024;

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= CHANNEL_COUNT; ch += 1) {
    s.set(`ch${ch}:switch`, ch === 1 ? "ON" : "OFF");
    s.set(`ch${ch}:scale`, "1.0");
    s.set(`ch${ch}:offset`, "0.0");
    s.set(`ch${ch}:coupling`, "DC");
    s.set(`ch${ch}:bwlimit`, "FULL");
    s.set(`ch${ch}:invert`, "OFF");
    s.set(`ch${ch}:unit`, "V");
    s.set(`ch${ch}:probe`, "1");
  }
  s.set("timebase:scale", "1e-3");
  s.set("timebase:delay", "0");
  s.set("trig:sweep", "AUTO");
  s.set("trig:type", "EDGE");
  s.set("trig:edge:source", "CHANnel1");
  s.set("trig:edge:slope", "RISing");
  s.set("trig:edge:level", "0");
  s.set("acq:type", "NORMal");
  s.set("acq:average", "16");
  s.set("acq:mdepth", "1000000");
  s.set("wave:source", "CHANnel1");
  s.set("display:persistence", "MIN");
  return s;
}

function scalarChannel(
  keySuffix: string,
  pattern: RegExp,
  fallback: string,
  normalizeArg?: (raw: string) => string,
): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const m = pattern.exec(cmd.normalized);
    if (!m) return { kind: "none" };
    const ch = m[1];
    const key = `ch${ch}:${keySuffix}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    const raw = cmd.args[0] ?? fallback;
    ctx.state.set(key, normalizeArg ? normalizeArg(raw) : raw.toUpperCase());
    return { kind: "none" };
  };
}

const simpleGetSet = (key: string, fallback: string): CommandHandler =>
  (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    const raw = cmd.args[0] ?? fallback;
    ctx.state.set(key, raw);
    return { kind: "none" };
  };

function buildPreamble(ctx: Map<string, unknown>): string {
  const src = String(ctx.get("wave:source") ?? "CHANnel1");
  const chMatch = src.match(/(\d+)/);
  const ch = chMatch ? Number.parseInt(chMatch[1]!, 10) : 1;
  const scale = Number(ctx.get(`ch${ch}:scale`) ?? 1);
  const offset = Number(ctx.get(`ch${ch}:offset`) ?? 0);
  const timebase = Number(ctx.get("timebase:scale") ?? 1e-3);
  const xIncrement = timebase / 100;
  const xOrigin = -timebase * 7;
  const yMult = scale / 3000;
  const yOffset = offset;
  // 10-part CSV matching `:WAVeform:PREamble?` layout used by the driver.
  return [
    "0",
    String(WAVEFORM_POINTS),
    "1",
    "0",
    xIncrement.toExponential(6),
    xOrigin.toExponential(6),
    "0",
    yMult.toExponential(6),
    "0",
    yOffset.toExponential(6),
  ].join(",");
}

function buildWaveformSamples(ctx: Map<string, unknown>): Uint8Array {
  const bytes = new Uint8Array(WAVEFORM_POINTS * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < WAVEFORM_POINTS; i += 1) {
    const phase = (i / WAVEFORM_POINTS) * Math.PI * 4;
    const sample = Math.round(Math.sin(phase) * 2000);
    view.setInt16(i * 2, sample, true);
  }
  return bytes;
}

const waveformDataHandler: CommandHandler = (_, ctx): CommandResult => {
  const samples = buildWaveformSamples(ctx.state);
  return { kind: "binary", bytes: encodeIeee488Block(samples) };
};

const printHandler: CommandHandler = (): CommandResult => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { kind: "binary", bytes: encodeIeee488Block(png) };
};

const exactHandlers: Record<string, CommandHandler> = {
  "RUN": (): CommandResult => ({ kind: "none" }),
  "STOP": (): CommandResult => ({ kind: "none" }),
  "AUTOSET": (): CommandResult => ({ kind: "none" }),
  "TIMEBASE:SCALE": simpleGetSet("timebase:scale", "1e-3"),
  "TIMEBASE:SCALE?": simpleGetSet("timebase:scale", "1e-3"),
  "TIMEBASE:DELAY": simpleGetSet("timebase:delay", "0"),
  "TIMEBASE:DELAY?": simpleGetSet("timebase:delay", "0"),
  "TRIGGER:SWEEP": simpleGetSet("trig:sweep", "AUTO"),
  "TRIGGER:SWEEP?": simpleGetSet("trig:sweep", "AUTO"),
  "TRIGGER:TYPE": simpleGetSet("trig:type", "EDGE"),
  "TRIGGER:TYPE?": simpleGetSet("trig:type", "EDGE"),
  "TRIGGER:EDGE:SOURCE": simpleGetSet("trig:edge:source", "CHANnel1"),
  "TRIGGER:EDGE:SOURCE?": simpleGetSet("trig:edge:source", "CHANnel1"),
  "TRIGGER:EDGE:SLOPE": simpleGetSet("trig:edge:slope", "RISing"),
  "TRIGGER:EDGE:SLOPE?": simpleGetSet("trig:edge:slope", "RISing"),
  "TRIGGER:EDGE:LEVEL": simpleGetSet("trig:edge:level", "0"),
  "TRIGGER:EDGE:LEVEL?": simpleGetSet("trig:edge:level", "0"),
  "TRIGGER:FORCE": (): CommandResult => ({ kind: "none" }),
  "ACQUIRE:TYPE": simpleGetSet("acq:type", "NORMal"),
  "ACQUIRE:TYPE?": simpleGetSet("acq:type", "NORMal"),
  "ACQUIRE:AVERAGE": simpleGetSet("acq:average", "16"),
  "ACQUIRE:AVERAGE?": simpleGetSet("acq:average", "16"),
  "ACQUIRE:MDEPTH": simpleGetSet("acq:mdepth", "1000000"),
  "ACQUIRE:MDEPTH?": simpleGetSet("acq:mdepth", "1000000"),
  "WAVEFORM:SOURCE": simpleGetSet("wave:source", "CHANnel1"),
  "WAVEFORM:SOURCE?": simpleGetSet("wave:source", "CHANnel1"),
  "WAVEFORM:POINT": simpleGetSet("wave:points", "1000"),
  "WAVEFORM:POINT?": simpleGetSet("wave:points", "1000"),
  "WAVEFORM:PREAMBLE?": (_, ctx): CommandResult => ({
    kind: "line",
    text: buildPreamble(ctx.state),
  }),
  "WAVEFORM:DATA?": waveformDataHandler,
  "DISPLAY:PERSISTENCE": simpleGetSet("display:persistence", "MIN"),
  "DISPLAY:PERSISTENCE?": simpleGetSet("display:persistence", "MIN"),
};

const prefixHandlers = [
  { pattern: /^CHANNEL([1-4]):SWITCH(\?)?$/, handler: scalarChannel("switch", /^CHANNEL([1-4]):SWITCH(\??)$/, "OFF") },
  { pattern: /^CHANNEL([1-4]):SCALE(\?)?$/, handler: scalarChannel("scale", /^CHANNEL([1-4]):SCALE(\??)$/, "1.0", (r) => r) },
  { pattern: /^CHANNEL([1-4]):OFFSET(\?)?$/, handler: scalarChannel("offset", /^CHANNEL([1-4]):OFFSET(\??)$/, "0.0", (r) => r) },
  { pattern: /^CHANNEL([1-4]):COUPLING(\?)?$/, handler: scalarChannel("coupling", /^CHANNEL([1-4]):COUPLING(\??)$/, "DC") },
  { pattern: /^CHANNEL([1-4]):BWLIMIT(\?)?$/, handler: scalarChannel("bwlimit", /^CHANNEL([1-4]):BWLIMIT(\??)$/, "FULL") },
  { pattern: /^CHANNEL([1-4]):INVERT(\?)?$/, handler: scalarChannel("invert", /^CHANNEL([1-4]):INVERT(\??)$/, "OFF") },
  { pattern: /^CHANNEL([1-4]):UNIT(\?)?$/, handler: scalarChannel("unit", /^CHANNEL([1-4]):UNIT(\??)$/, "V") },
  { pattern: /^CHANNEL([1-4]):PROBE(\?)?$/, handler: scalarChannel("probe", /^CHANNEL([1-4]):PROBE(\??)$/, "1", (r) => r) },
  {
    pattern: /^PRINT\?/,
    handler: printHandler,
  },
];

export const siglentSds824xHdPersonality: SimulatorPersonality = {
  id: "siglent-sds824x-hd",
  kind: "oscilloscope",
  idn: "Siglent Technologies,SDS824X HD,{serial},1.2.2.1.3R1",
  opt: "",
  fixture,
  initialState: defaultState,
  exactHandlers,
  prefixHandlers,
};
