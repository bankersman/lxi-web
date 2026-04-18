import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "ssa3032x.fixture.json"), "utf8"),
) as PersonalityFixture;

const FREQ_MIN = 9e3;
const FREQ_MAX = 3.2e9;
const REF_MIN = -100;
const REF_MAX = 30;
const ATT_MIN = 0;
const ATT_MAX = 51;

function clamp(raw: string, min: number, max: number): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.max(min, Math.min(max, n)));
}

function setOrGet(
  key: string,
  fallback: string,
  clampFn?: (raw: string) => string,
): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    const arg = cmd.args[0] ?? fallback;
    ctx.state.set(key, clampFn ? clampFn(arg) : arg);
    return { kind: "none" };
  };
}

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("freq:center", "1.6e9");
  s.set("freq:span", "3.2e9");
  s.set("freq:start", "0");
  s.set("freq:stop", "3.2e9");
  s.set("ref:level", "0");
  s.set("bw:res", "1e6");
  s.set("bw:vid", "1e6");
  s.set("bw:res:auto", "1");
  s.set("bw:vid:auto", "1");
  s.set("sweep:points", "751");
  s.set("sweep:time", "0.03");
  s.set("sweep:cont", "1");
  s.set("att:db", "10");
  s.set("att:auto", "1");
  s.set("preamp", "0");
  for (let t = 1; t <= 4; t += 1) {
    s.set(`trace:${t}:mode`, "WRITE");
    s.set(`trace:${t}:display`, "1");
  }
  s.set("trace:detector", "POSITIVE");
  for (let m = 1; m <= 8; m += 1) {
    s.set(`marker:${m}:state`, "0");
    s.set(`marker:${m}:mode`, "POSITION");
    s.set(`marker:${m}:x`, "1e9");
    s.set(`marker:${m}:y`, "-30");
  }
  s.set("chp:state", "0");
  s.set("chp:mode", "CHPower");
  s.set("chp:ibw", "1e6");
  s.set("chp:space", "1e6");
  s.set("chp:count", "2");
  s.set("trig:source", "IMMEDIATE");
  s.set("trig:level", "-25");
  s.set("trig:slope", "POSITIVE");
  s.set("avg:state", "0");
  s.set("avg:count", "100");
  s.set("avg:type", "LOG");
  return s;
}

function synthesizeTraceCsv(
  centerHz: number,
  spanHz: number,
  points: number,
  refDbm: number,
): string {
  const out: string[] = [];
  const start = centerHz - spanHz / 2;
  const step = points > 1 ? spanHz / (points - 1) : 0;
  for (let i = 0; i < points; i += 1) {
    const f = start + step * i;
    const normalized = spanHz > 0 ? (f - centerHz) / (spanHz / 2) : 0;
    const envelope = -20 - 30 * Math.abs(normalized);
    const jitter = Math.sin(i * 0.37 + centerHz * 1e-9) * 1.5;
    out.push((refDbm + envelope + jitter).toFixed(2));
  }
  return out.join(",");
}

const prefixHandlers: PrefixHandlerEntry[] = [
  {
    pattern: /^TRACE:DATA\?$/,
    handler: (_, ctx): CommandResult => {
      const points = Math.max(
        1,
        Math.round(Number(ctx.state.get("sweep:points") ?? 751)),
      );
      const center = Number(ctx.state.get("freq:center") ?? 1.6e9);
      const span = Number(ctx.state.get("freq:span") ?? 3.2e9);
      const ref = Number(ctx.state.get("ref:level") ?? 0);
      return { kind: "line", text: synthesizeTraceCsv(center, span, points, ref) };
    },
  },
  {
    pattern: /^TRACE:DATA\?\s+\d+$/,
    handler: (_, ctx): CommandResult => {
      const points = Math.max(
        1,
        Math.round(Number(ctx.state.get("sweep:points") ?? 751)),
      );
      const center = Number(ctx.state.get("freq:center") ?? 1.6e9);
      const span = Number(ctx.state.get("freq:span") ?? 3.2e9);
      const ref = Number(ctx.state.get("ref:level") ?? 0);
      return { kind: "line", text: synthesizeTraceCsv(center, span, points, ref) };
    },
  },
];

const exactHandlers: Record<string, CommandHandler> = {
  "SENSE:FREQUENCY:CENTER": setOrGet("freq:center", "1.6e9", (raw) =>
    clamp(raw, FREQ_MIN, FREQ_MAX),
  ),
  "SENSE:FREQUENCY:CENTER?": setOrGet("freq:center", "1.6e9"),
  "SENSE:FREQUENCY:SPAN": setOrGet("freq:span", "3.2e9", (raw) =>
    clamp(raw, 0, FREQ_MAX),
  ),
  "SENSE:FREQUENCY:SPAN?": setOrGet("freq:span", "3.2e9"),
  "SENSE:FREQUENCY:START": setOrGet("freq:start", "0", (raw) =>
    clamp(raw, 0, FREQ_MAX),
  ),
  "SENSE:FREQUENCY:START?": setOrGet("freq:start", "0"),
  "SENSE:FREQUENCY:STOP": setOrGet("freq:stop", "3.2e9", (raw) =>
    clamp(raw, 0, FREQ_MAX),
  ),
  "SENSE:FREQUENCY:STOP?": setOrGet("freq:stop", "3.2e9"),
  "DISPLAY:WINDOW:TRACE:Y:SCALE:RLEVEL": setOrGet("ref:level", "0", (raw) =>
    clamp(raw, REF_MIN, REF_MAX),
  ),
  "DISPLAY:WINDOW:TRACE:Y:SCALE:RLEVEL?": setOrGet("ref:level", "0"),
  "SENSE:BANDWIDTH:RESOLUTION": setOrGet("bw:res", "1e6"),
  "SENSE:BANDWIDTH:RESOLUTION?": setOrGet("bw:res", "1e6"),
  "SENSE:BANDWIDTH:VIDEO": setOrGet("bw:vid", "1e6"),
  "SENSE:BANDWIDTH:VIDEO?": setOrGet("bw:vid", "1e6"),
  "SENSE:BANDWIDTH:RESOLUTION:AUTO": setOrGet("bw:res:auto", "1"),
  "SENSE:BANDWIDTH:RESOLUTION:AUTO?": setOrGet("bw:res:auto", "1"),
  "SENSE:BANDWIDTH:VIDEO:AUTO": setOrGet("bw:vid:auto", "1"),
  "SENSE:BANDWIDTH:VIDEO:AUTO?": setOrGet("bw:vid:auto", "1"),
  "SENSE:SWEEP:POINTS": setOrGet("sweep:points", "751", (raw) =>
    clamp(raw, 101, 751),
  ),
  "SENSE:SWEEP:POINTS?": setOrGet("sweep:points", "751"),
  "SENSE:SWEEP:TIME": setOrGet("sweep:time", "0.03"),
  "SENSE:SWEEP:TIME?": setOrGet("sweep:time", "0.03"),
  "INITIATE:CONTINUOUS": setOrGet("sweep:cont", "1"),
  "INITIATE:CONTINUOUS?": setOrGet("sweep:cont", "1"),
  "INITIATE:IMMEDIATE": (): CommandResult => ({ kind: "none" }),
  "SENSE:POWER:RF:ATTENUATION": setOrGet("att:db", "10", (raw) =>
    clamp(raw, ATT_MIN, ATT_MAX),
  ),
  "SENSE:POWER:RF:ATTENUATION?": setOrGet("att:db", "10"),
  "SENSE:POWER:RF:ATTENUATION:AUTO": setOrGet("att:auto", "1"),
  "SENSE:POWER:RF:ATTENUATION:AUTO?": setOrGet("att:auto", "1"),
  "SENSE:POWER:RF:GAIN:STATE": setOrGet("preamp", "0"),
  "SENSE:POWER:RF:GAIN:STATE?": setOrGet("preamp", "0"),
  "TRACE:DETECTOR:FUNCTION": setOrGet("trace:detector", "POSITIVE"),
  "TRACE:DETECTOR:FUNCTION?": setOrGet("trace:detector", "POSITIVE"),
  "SENSE:POWER:ACHANNEL:STATE": setOrGet("chp:state", "0"),
  "SENSE:POWER:ACHANNEL:STATE?": setOrGet("chp:state", "0"),
  "CONFIGURE:POWER:MODE": setOrGet("chp:mode", "CHPower"),
  "CONFIGURE:POWER:MODE?": setOrGet("chp:mode", "CHPower"),
  "SENSE:POWER:ACHANNEL:BANDWIDTH:INTEGRATION": setOrGet("chp:ibw", "1e6"),
  "SENSE:POWER:ACHANNEL:BANDWIDTH:INTEGRATION?": setOrGet("chp:ibw", "1e6"),
  "SENSE:POWER:ACHANNEL:SPACING": setOrGet("chp:space", "1e6"),
  "SENSE:POWER:ACHANNEL:SPACING?": setOrGet("chp:space", "1e6"),
  "SENSE:POWER:ACHANNEL:COUNT": setOrGet("chp:count", "2"),
  "SENSE:POWER:ACHANNEL:COUNT?": setOrGet("chp:count", "2"),
  "READ:CHPOWER?": (_, ctx): CommandResult => {
    const ref = Number(ctx.state.get("ref:level") ?? 0);
    return { kind: "line", text: `${(ref - 20).toFixed(2)},-45.3,-45.1` };
  },
  "TRIGGER:SEQUENCE:SOURCE": setOrGet("trig:source", "IMMEDIATE"),
  "TRIGGER:SEQUENCE:SOURCE?": setOrGet("trig:source", "IMMEDIATE"),
  "TRIGGER:SEQUENCE:VIDEO:LEVEL": setOrGet("trig:level", "-25"),
  "TRIGGER:SEQUENCE:VIDEO:LEVEL?": setOrGet("trig:level", "-25"),
  "TRIGGER:SEQUENCE:EXTERNAL:SLOPE": setOrGet("trig:slope", "POSITIVE"),
  "TRIGGER:SEQUENCE:EXTERNAL:SLOPE?": setOrGet("trig:slope", "POSITIVE"),
  "SENSE:AVERAGE:TRACE1:STATE": setOrGet("avg:state", "0"),
  "SENSE:AVERAGE:TRACE1:STATE?": setOrGet("avg:state", "0"),
  "SENSE:AVERAGE:TRACE1:COUNT": setOrGet("avg:count", "100"),
  "SENSE:AVERAGE:TRACE1:COUNT?": setOrGet("avg:count", "100"),
  "SENSE:AVERAGE:TYPE": setOrGet("avg:type", "LOG"),
  "SENSE:AVERAGE:TYPE?": setOrGet("avg:type", "LOG"),
};

// Trace / marker families — wire up per-index handlers programmatically.
for (let t = 1; t <= 4; t += 1) {
  exactHandlers[`TRACE${t}:MODE`] = setOrGet(`trace:${t}:mode`, "WRITE");
  exactHandlers[`TRACE${t}:MODE?`] = setOrGet(`trace:${t}:mode`, "WRITE");
  exactHandlers[`TRACE${t}:DISPLAY`] = setOrGet(`trace:${t}:display`, "1");
  exactHandlers[`TRACE${t}:DISPLAY?`] = setOrGet(`trace:${t}:display`, "1");
}

for (let m = 1; m <= 8; m += 1) {
  exactHandlers[`CALCULATE:MARKER${m}:STATE`] = setOrGet(
    `marker:${m}:state`,
    "0",
  );
  exactHandlers[`CALCULATE:MARKER${m}:STATE?`] = setOrGet(
    `marker:${m}:state`,
    "0",
  );
  exactHandlers[`CALCULATE:MARKER${m}:MODE`] = setOrGet(
    `marker:${m}:mode`,
    "POSITION",
  );
  exactHandlers[`CALCULATE:MARKER${m}:MODE?`] = setOrGet(
    `marker:${m}:mode`,
    "POSITION",
  );
  exactHandlers[`CALCULATE:MARKER${m}:X`] = setOrGet(
    `marker:${m}:x`,
    "1e9",
    (raw) => clamp(raw, FREQ_MIN, FREQ_MAX),
  );
  exactHandlers[`CALCULATE:MARKER${m}:X?`] = setOrGet(`marker:${m}:x`, "1e9");
  exactHandlers[`CALCULATE:MARKER${m}:Y?`] = setOrGet(`marker:${m}:y`, "-30");
  exactHandlers[`CALCULATE:MARKER${m}:MAXIMUM`] = (_, ctx) => {
    ctx.state.set(`marker:${m}:state`, "1");
    ctx.state.set(`marker:${m}:y`, "-10.5");
    return { kind: "none" };
  };
}

/**
 * Siglent SSA3032X-R simulator personality. Mirrors the SCPI surface that
 * the `SiglentSsa3000x` driver exercises: frequency / reference / bandwidth
 * / sweep / traces / input / markers / channel-power / trigger / averaging.
 * Trace data is a cheap analytic stand-in (skirted hump around center) — the
 * goal is round-trip correctness, not realistic spectra.
 */
export const siglentSsa3032xPersonality: SimulatorPersonality = {
  id: "siglent-ssa3032x",
  kind: "spectrumAnalyzer",
  idn: "Siglent Technologies,SSA3032X-R,{serial},1.2.9.3R5",
  opt: "TG,AMK,EMI,REF",
  fixture,
  initialState: defaultState,
  exactHandlers,
  prefixHandlers,
};
