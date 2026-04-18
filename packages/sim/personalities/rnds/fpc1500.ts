import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Rohde & Schwarz FPC1500 — 1 GHz entry spectrum analyzer with TG.
 *
 * SCPI surface matches the FSW SAN application:
 *   - `SENSe:FREQuency:*` for center / span / start / stop.
 *   - `DISPlay:WINDow:TRACe:Y:SCALe:RLEVel` for reference level.
 *   - `SENSe:BANDwidth:*` for RBW / VBW with AUTO.
 *   - `SENSe:SWEep:POINts|TIME` + `INITiate:CONTinuous`.
 *   - `TRACe:DATA? TRACE<n>` returns a comma-separated trace in dBm.
 */

const TRACE_POINTS = 401;

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("freq:center", "1.00000000E+08");
  s.set("freq:span", "1.00000000E+08");
  s.set("freq:start", "5.00000000E+07");
  s.set("freq:stop", "1.50000000E+08");
  s.set("ref:level", "0.00");
  s.set("bw:rbw", "1.00000E+05");
  s.set("bw:vbw", "1.00000E+05");
  s.set("bw:rbw:auto", "1");
  s.set("bw:vbw:auto", "1");
  s.set("sweep:points", `${TRACE_POINTS}`);
  s.set("sweep:time", "1.00000E-02");
  s.set("sweep:cont", "1");
  s.set("input:att", "0");
  s.set("input:att:auto", "1");
  s.set("input:gain", "0");
  for (let t = 1; t <= 3; t += 1) {
    s.set(`trace${t}:mode`, "WRITe");
    s.set(`trace${t}:det`, "POSitive");
    s.set(`trace${t}:state`, t === 1 ? "1" : "0");
  }
  for (let m = 1; m <= 4; m += 1) {
    s.set(`marker${m}:state`, m === 1 ? "1" : "0");
    s.set(`marker${m}:x`, "1.00000000E+08");
    s.set(`marker${m}:y`, "-30.00");
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

function prefixScalar(
  pattern: RegExp,
  key: (m: RegExpExecArray) => string,
  fallback: string,
): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized)!;
      const k = key(match);
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(k) ?? fallback) };
      }
      ctx.state.set(k, cmd.args[0] ?? fallback);
      return { kind: "none" };
    },
  };
}

function prefixBool(
  pattern: RegExp,
  key: (m: RegExpExecArray) => string,
): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized)!;
      const k = key(match);
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(k) ?? "0") };
      }
      const arg = (cmd.args[0] ?? "OFF").toUpperCase();
      ctx.state.set(k, arg === "ON" || arg === "1" ? "1" : "0");
      return { kind: "none" };
    },
  };
}

const traceDataHandler: CommandHandler = (cmd): CommandResult => {
  const trace = cmd.args[0]?.toUpperCase() ?? "TRACE1";
  const seed = trace.endsWith("2") ? 7 : trace.endsWith("3") ? 13 : 1;
  const values: string[] = new Array(TRACE_POINTS);
  for (let i = 0; i < TRACE_POINTS; i += 1) {
    const phase = (i / TRACE_POINTS) * Math.PI * 2;
    const v = -50 + 25 * Math.sin(phase * seed);
    values[i] = v.toFixed(3);
  }
  return { kind: "line", text: values.join(",") };
};

const exactHandlers: Record<string, CommandHandler> = {
  "SENSE:FREQUENCY:CENTER": scalar("freq:center", "1.00000000E+08"),
  "SENSE:FREQUENCY:CENTER?": scalar("freq:center", "1.00000000E+08"),
  "SENSE:FREQUENCY:SPAN": scalar("freq:span", "1.00000000E+08"),
  "SENSE:FREQUENCY:SPAN?": scalar("freq:span", "1.00000000E+08"),
  "SENSE:FREQUENCY:START": scalar("freq:start", "5.00000000E+07"),
  "SENSE:FREQUENCY:START?": scalar("freq:start", "5.00000000E+07"),
  "SENSE:FREQUENCY:STOP": scalar("freq:stop", "1.50000000E+08"),
  "SENSE:FREQUENCY:STOP?": scalar("freq:stop", "1.50000000E+08"),
  "DISPLAY:WINDOW:TRACE:Y:SCALE:RLEVEL": scalar("ref:level", "0.00"),
  "DISPLAY:WINDOW:TRACE:Y:SCALE:RLEVEL?": scalar("ref:level", "0.00"),
  "SENSE:BANDWIDTH:RESOLUTION": scalar("bw:rbw", "1.00000E+05"),
  "SENSE:BANDWIDTH:RESOLUTION?": scalar("bw:rbw", "1.00000E+05"),
  "SENSE:BANDWIDTH:RESOLUTION:AUTO": boolScalar("bw:rbw:auto"),
  "SENSE:BANDWIDTH:RESOLUTION:AUTO?": boolScalar("bw:rbw:auto"),
  "SENSE:BANDWIDTH:VIDEO": scalar("bw:vbw", "1.00000E+05"),
  "SENSE:BANDWIDTH:VIDEO?": scalar("bw:vbw", "1.00000E+05"),
  "SENSE:BANDWIDTH:VIDEO:AUTO": boolScalar("bw:vbw:auto"),
  "SENSE:BANDWIDTH:VIDEO:AUTO?": boolScalar("bw:vbw:auto"),
  "SENSE:SWEEP:POINTS": scalar("sweep:points", `${TRACE_POINTS}`),
  "SENSE:SWEEP:POINTS?": scalar("sweep:points", `${TRACE_POINTS}`),
  "SENSE:SWEEP:TIME": scalar("sweep:time", "1.00000E-02"),
  "SENSE:SWEEP:TIME?": scalar("sweep:time", "1.00000E-02"),
  "INITIATE:CONTINUOUS": boolScalar("sweep:cont"),
  "INITIATE:CONTINUOUS?": boolScalar("sweep:cont"),
  "INITIATE:IMMEDIATE": (): CommandResult => ({ kind: "none" }),
  "INPUT:ATTENUATION": scalar("input:att", "0"),
  "INPUT:ATTENUATION?": scalar("input:att", "0"),
  "INPUT:ATTENUATION:AUTO": boolScalar("input:att:auto"),
  "INPUT:ATTENUATION:AUTO?": boolScalar("input:att:auto"),
  "INPUT:GAIN:STATE": boolScalar("input:gain"),
  "INPUT:GAIN:STATE?": boolScalar("input:gain"),
  "TRACE:DATA?": traceDataHandler,
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  prefixScalar(
    /^DISPLAY:WINDOW:TRACE([1-3]):MODE\??$/,
    (m) => `trace${m[1]}:mode`,
    "WRITe",
  ),
  prefixScalar(
    /^SENSE:DETECTOR([1-3]):FUNCTION\??$/,
    (m) => `trace${m[1]}:det`,
    "POSitive",
  ),
  prefixBool(
    /^DISPLAY:WINDOW:TRACE([1-3]):STATE\??$/,
    (m) => `trace${m[1]}:state`,
  ),
  prefixBool(/^CALCULATE:MARKER([1-4]):STATE\??$/, (m) => `marker${m[1]}:state`),
  prefixScalar(
    /^CALCULATE:MARKER([1-4]):X\??$/,
    (m) => `marker${m[1]}:x`,
    "1.00000000E+08",
  ),
  prefixScalar(
    /^CALCULATE:MARKER([1-4]):Y\??$/,
    (m) => `marker${m[1]}:y`,
    "-30.00",
  ),
  {
    pattern: /^CALCULATE:MARKER[1-4]:MAXIMUM:PEAK$/,
    handler: (): CommandResult => ({ kind: "none" }),
  },
];

export const rndsFpc1500Personality: SimulatorPersonality = {
  id: "rnds-fpc1500",
  kind: "spectrumAnalyzer",
  idn: "Rohde&Schwarz,FPC1500,{serial},FV:1.40",
  opt: "B22,K7",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
