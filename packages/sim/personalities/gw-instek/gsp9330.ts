import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek GSP-9330 — 3.25 GHz spectrum analyzer.
 *
 * SCPI surface follows SCPI-1999 with R&S-style frequency / bandwidth /
 * trace tree. Trace readback returns CSV ASCII floats.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("freq:center", "1.000000E+09");
  s.set("freq:span", "2.000000E+09");
  s.set("freq:start", "0.000000E+00");
  s.set("freq:stop", "3.250000E+09");
  s.set("ref:level", "0");
  s.set("bw:rbw", "1.000E+06");
  s.set("bw:vbw", "1.000E+06");
  s.set("bw:rbw:auto", "1");
  s.set("bw:vbw:auto", "1");
  s.set("sweep:points", "601");
  s.set("sweep:time", "0.050");
  s.set("init:continuous", "1");
  s.set("input:attenuation", "10");
  s.set("input:attenuation:auto", "1");
  s.set("input:preamp", "0");
  for (let t = 1; t <= 4; t += 1) {
    s.set(`trace${t}:mode`, "WRITE");
    s.set(`trace${t}:state`, t === 1 ? "1" : "0");
    s.set(`trace${t}:detector`, "POS");
  }
  for (let m = 1; m <= 6; m += 1) {
    s.set(`marker${m}:state`, "0");
    s.set(`marker${m}:x`, "0");
    s.set(`marker${m}:y`, "-100");
  }
  return s;
}

function scalar(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function boolScalar(key: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  };
}

const exactHandlers: Record<string, CommandHandler> = {
  "SENSE:FREQUENCY:CENTER": scalar("freq:center", "1.000000E+09"),
  "SENSE:FREQUENCY:CENTER?": scalar("freq:center", "1.000000E+09"),
  "SENSE:FREQUENCY:SPAN": scalar("freq:span", "2.000000E+09"),
  "SENSE:FREQUENCY:SPAN?": scalar("freq:span", "2.000000E+09"),
  "SENSE:FREQUENCY:START": scalar("freq:start", "0.000000E+00"),
  "SENSE:FREQUENCY:START?": scalar("freq:start", "0.000000E+00"),
  "SENSE:FREQUENCY:STOP": scalar("freq:stop", "3.250000E+09"),
  "SENSE:FREQUENCY:STOP?": scalar("freq:stop", "3.250000E+09"),
  "DISPLAY:WINDOW:TRACE:Y:RLEVEL": scalar("ref:level", "0"),
  "DISPLAY:WINDOW:TRACE:Y:RLEVEL?": scalar("ref:level", "0"),
  "SENSE:BANDWIDTH:RESOLUTION": scalar("bw:rbw", "1.000E+06"),
  "SENSE:BANDWIDTH:RESOLUTION?": scalar("bw:rbw", "1.000E+06"),
  "SENSE:BANDWIDTH:VIDEO": scalar("bw:vbw", "1.000E+06"),
  "SENSE:BANDWIDTH:VIDEO?": scalar("bw:vbw", "1.000E+06"),
  "SENSE:BANDWIDTH:RESOLUTION:AUTO": boolScalar("bw:rbw:auto"),
  "SENSE:BANDWIDTH:RESOLUTION:AUTO?": boolScalar("bw:rbw:auto"),
  "SENSE:BANDWIDTH:VIDEO:AUTO": boolScalar("bw:vbw:auto"),
  "SENSE:BANDWIDTH:VIDEO:AUTO?": boolScalar("bw:vbw:auto"),
  "SENSE:SWEEP:POINTS": scalar("sweep:points", "601"),
  "SENSE:SWEEP:POINTS?": scalar("sweep:points", "601"),
  "SENSE:SWEEP:TIME": scalar("sweep:time", "0.050"),
  "SENSE:SWEEP:TIME?": scalar("sweep:time", "0.050"),
  "INITIATE:CONTINUOUS": boolScalar("init:continuous"),
  "INITIATE:CONTINUOUS?": boolScalar("init:continuous"),
  "INITIATE:IMMEDIATE": (): CommandResult => ({ kind: "none" }),
  "INPUT:ATTENUATION": scalar("input:attenuation", "10"),
  "INPUT:ATTENUATION?": scalar("input:attenuation", "10"),
  "INPUT:ATTENUATION:AUTO": boolScalar("input:attenuation:auto"),
  "INPUT:ATTENUATION:AUTO?": boolScalar("input:attenuation:auto"),
  "SENSE:POWER:RF:GAIN:STATE": boolScalar("input:preamp"),
  "SENSE:POWER:RF:GAIN:STATE?": boolScalar("input:preamp"),
  "TRACE:DATA?": (_cmd): CommandResult => {
    const points = 51;
    const out: string[] = [];
    for (let i = 0; i < points; i += 1) {
      const noise = -70 + Math.sin(i / 5) * 10;
      out.push(noise.toFixed(2));
    }
    return { kind: "line", text: out.join(",") };
  },
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

const traceHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^TRACE([1-4]):(MODE|STATE)(\??)$/.exec(cmd.normalized);
  if (!m) return { kind: "none" };
  const t = Number.parseInt(m[1]!, 10);
  const prop = m[2]!.toLowerCase();
  const full = `trace${t}:${prop}`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(full) ?? "0") };
  }
  const val = (cmd.args[0] ?? "").toUpperCase();
  if (prop === "state") {
    ctx.state.set(full, val === "ON" || val === "1" ? "1" : "0");
  } else {
    ctx.state.set(full, val);
  }
  return { kind: "none" };
};

const detectorHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^SENSE:DETECTOR([1-4])(\??)$/.exec(cmd.normalized);
  if (!m) return { kind: "none" };
  const t = Number.parseInt(m[1]!, 10);
  const full = `trace${t}:detector`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(full) ?? "POS") };
  }
  ctx.state.set(full, (cmd.args[0] ?? "POS").toUpperCase());
  return { kind: "none" };
};

const markerHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^CALCULATE:MARKER([1-6]):(STATE|X|Y|MAXIMUM)(\??)$/.exec(cmd.normalized);
  if (!m) return { kind: "none" };
  const mk = Number.parseInt(m[1]!, 10);
  const prop = m[2]!;
  if (prop === "MAXIMUM") {
    ctx.state.set(`marker${mk}:x`, "1.5E+09");
    ctx.state.set(`marker${mk}:y`, "-30");
    return { kind: "none" };
  }
  const full = `marker${mk}:${prop.toLowerCase()}`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(full) ?? "0") };
  }
  if (prop === "STATE") {
    const on = (cmd.args[0] ?? "OFF").toUpperCase() === "ON" ? "1" : "0";
    ctx.state.set(full, on);
  } else {
    ctx.state.set(full, cmd.args[0] ?? "0");
  }
  return { kind: "none" };
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  { pattern: /^TRACE[1-4]:(MODE|STATE)(\?)?$/, handler: traceHandler },
  { pattern: /^SENSE:DETECTOR[1-4](\?)?$/, handler: detectorHandler },
  { pattern: /^CALCULATE:MARKER[1-6]:(STATE|X|Y|MAXIMUM)(\?)?$/, handler: markerHandler },
];

export const gwInstekGsp9330Personality: SimulatorPersonality = {
  id: "gwinstek-gsp9330",
  kind: "spectrumAnalyzer",
  idn: "GW Instek,GSP-9330,{serial},V1.30",
  opt: "TG",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
