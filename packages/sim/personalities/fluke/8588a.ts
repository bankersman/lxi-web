import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Fluke 8588A — 8½-digit metrology reference DMM.
 *
 * Narrower SCPI surface than the bench 8845A/8846A: no dual-display,
 * no capacitance, no temperature transducers. We emit high-precision
 * `READ?` values that exercise the 8588A digit count, and gate the
 * personality's `idn` string to match the real device's exact format
 * (`FLUKE, 8588A, ...`) so the manufacturer regex + driver resolution
 * path is well covered by the simulator integration tests.
 */
function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("function", "VOLT");
  s.set("volt:range", "10");
  s.set("volt:auto", "1");
  s.set("volt:nplc", "10");
  s.set("volt:ac:range", "10");
  s.set("volt:ac:auto", "1");
  s.set("volt:ac:nplc", "10");
  s.set("curr:range", "1");
  s.set("curr:auto", "1");
  s.set("curr:nplc", "10");
  s.set("res:range", "1000");
  s.set("res:auto", "1");
  s.set("res:nplc", "10");
  s.set("fres:range", "1000");
  s.set("fres:auto", "1");
  s.set("fres:nplc", "10");
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

function configureMode(token: string): CommandHandler {
  return (_cmd, ctx): CommandResult => {
    ctx.state.set("function", token);
    return { kind: "none" };
  };
}

const exactHandlers: Record<string, CommandHandler> = {
  "CONFIGURE:VOLTAGE:DC": configureMode("VOLT"),
  "CONFIGURE:VOLTAGE:AC": configureMode("VOLT:AC"),
  "CONFIGURE:CURRENT:DC": configureMode("CURR"),
  "CONFIGURE:CURRENT:AC": configureMode("CURR:AC"),
  "CONFIGURE:RESISTANCE": configureMode("RES"),
  "CONFIGURE:FRESISTANCE": configureMode("FRES"),
  "CONFIGURE:FREQUENCY": configureMode("FREQ"),
  "SENSE:FUNCTION?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: `"${String(ctx.state.get("function") ?? "VOLT")}"`,
  }),
  "READ?": (_cmd, ctx): CommandResult => {
    const fn = String(ctx.state.get("function") ?? "VOLT").toUpperCase();
    if (fn.startsWith("VOLT:AC")) return { kind: "line", text: "+2.3456789E+00" };
    if (fn.startsWith("VOLT")) return { kind: "line", text: "+1.2345678E+00" };
    if (fn.startsWith("CURR:AC")) return { kind: "line", text: "+2.0000000E-02" };
    if (fn.startsWith("CURR")) return { kind: "line", text: "+1.0000000E-02" };
    if (fn.startsWith("FRES") || fn.startsWith("RES"))
      return { kind: "line", text: "+1.0000000E+02" };
    if (fn.startsWith("FREQ")) return { kind: "line", text: "+5.0000000E+01" };
    return { kind: "line", text: "+0.0000000E+00" };
  },
  "SENSE:VOLTAGE:DC:RANGE": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE?": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO?": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:NPLC": scalar("volt:nplc", "10"),
  "SENSE:VOLTAGE:DC:NPLC?": scalar("volt:nplc", "10"),
  "SENSE:VOLTAGE:AC:RANGE": scalar("volt:ac:range", "10"),
  "SENSE:VOLTAGE:AC:RANGE?": scalar("volt:ac:range", "10"),
  "SENSE:VOLTAGE:AC:RANGE:AUTO": boolScalar("volt:ac:auto"),
  "SENSE:VOLTAGE:AC:RANGE:AUTO?": boolScalar("volt:ac:auto"),
  "SENSE:VOLTAGE:AC:NPLC": scalar("volt:ac:nplc", "10"),
  "SENSE:VOLTAGE:AC:NPLC?": scalar("volt:ac:nplc", "10"),
  "SENSE:CURRENT:DC:RANGE": scalar("curr:range", "1"),
  "SENSE:CURRENT:DC:RANGE?": scalar("curr:range", "1"),
  "SENSE:CURRENT:DC:RANGE:AUTO": boolScalar("curr:auto"),
  "SENSE:CURRENT:DC:RANGE:AUTO?": boolScalar("curr:auto"),
  "SENSE:CURRENT:DC:NPLC": scalar("curr:nplc", "10"),
  "SENSE:CURRENT:DC:NPLC?": scalar("curr:nplc", "10"),
  "SENSE:RESISTANCE:RANGE": scalar("res:range", "1000"),
  "SENSE:RESISTANCE:RANGE?": scalar("res:range", "1000"),
  "SENSE:RESISTANCE:RANGE:AUTO": boolScalar("res:auto"),
  "SENSE:RESISTANCE:RANGE:AUTO?": boolScalar("res:auto"),
  "SENSE:RESISTANCE:NPLC": scalar("res:nplc", "10"),
  "SENSE:RESISTANCE:NPLC?": scalar("res:nplc", "10"),
  "SENSE:FRESISTANCE:RANGE": scalar("fres:range", "1000"),
  "SENSE:FRESISTANCE:RANGE?": scalar("fres:range", "1000"),
  "SENSE:FRESISTANCE:RANGE:AUTO": boolScalar("fres:auto"),
  "SENSE:FRESISTANCE:RANGE:AUTO?": boolScalar("fres:auto"),
  "SENSE:FRESISTANCE:NPLC": scalar("fres:nplc", "10"),
  "SENSE:FRESISTANCE:NPLC?": scalar("fres:nplc", "10"),
  "CALCULATE:STATE": boolScalar("calc:state"),
  "CALCULATE:STATE?": boolScalar("calc:state"),
  "CALCULATE:FUNCTION": scalar("calc:function", "NULL"),
  "CALCULATE:FUNCTION?": scalar("calc:function", "NULL"),
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '+0,"No error"',
  }),
};

export const fluke8588aPersonality: SimulatorPersonality = {
  id: "fluke-8588a",
  kind: "multimeter",
  idn: "FLUKE,8588A,{serial},1.0",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
