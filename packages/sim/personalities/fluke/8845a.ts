import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Fluke 8845A — 6½-digit bench DMM with dual display + math.
 *
 * SCPI tree matches IVI-4.8: `CONFigure:<fn>` / `SENSe:FUNCtion?` /
 * `READ?` / `SENSe:<fn>:RANGe[:AUTO]` / `SENSe:<fn>:NPLC`.
 *
 * Dual display is modelled with a secondary function slot and a simple
 * `DISPlay:WINDow2:STATe` toggle. Math is a stub — driver writes a
 * function + state and reads them back, no statistics computation.
 */
function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("function", "VOLT");
  s.set("volt:range", "10");
  s.set("volt:auto", "1");
  s.set("volt:nplc", "1");
  s.set("volt:ac:range", "10");
  s.set("volt:ac:auto", "1");
  s.set("volt:ac:nplc", "1");
  s.set("curr:range", "1");
  s.set("curr:auto", "1");
  s.set("curr:nplc", "1");
  s.set("res:range", "1000");
  s.set("res:auto", "1");
  s.set("res:nplc", "1");
  s.set("fres:range", "1000");
  s.set("fres:auto", "1");
  s.set("fres:nplc", "1");
  s.set("window2:state", "0");
  s.set("window2:function", "VOLT:AC");
  s.set("calc:state", "0");
  s.set("calc:function", "NULL");
  s.set("calc:null:offset", "0");
  s.set("calc:dbm:reference", "600");
  s.set("calc:limit:upper", "0");
  s.set("calc:limit:lower", "0");
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
  "CONFIGURE:PERIOD": configureMode("PER"),
  "CONFIGURE:CONTINUITY": configureMode("CONT"),
  "CONFIGURE:DIODE": configureMode("DIOD"),
  "CONFIGURE:TEMPERATURE": configureMode("TEMP"),
  "SENSE:FUNCTION?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: `"${String(ctx.state.get("function") ?? "VOLT")}"`,
  }),
  "READ?": (_cmd, ctx): CommandResult => {
    const fn = String(ctx.state.get("function") ?? "VOLT").toUpperCase();
    if (fn.startsWith("VOLT:AC")) return { kind: "line", text: "+2.34567E+00" };
    if (fn.startsWith("VOLT")) return { kind: "line", text: "+1.23456E+00" };
    if (fn.startsWith("CURR:AC")) return { kind: "line", text: "+2.00000E-02" };
    if (fn.startsWith("CURR")) return { kind: "line", text: "+1.00000E-02" };
    if (fn.startsWith("FRES") || fn.startsWith("RES"))
      return { kind: "line", text: "+1.00000E+02" };
    if (fn.startsWith("FREQ")) return { kind: "line", text: "+5.00000E+01" };
    return { kind: "line", text: "+0.00000E+00" };
  },
  "READ:SECONDARY?": (): CommandResult => ({ kind: "line", text: "+2.34567E+00" }),
  "SENSE:VOLTAGE:DC:RANGE": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE?": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO?": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:NPLC": scalar("volt:nplc", "1"),
  "SENSE:VOLTAGE:DC:NPLC?": scalar("volt:nplc", "1"),
  "SENSE:VOLTAGE:AC:RANGE": scalar("volt:ac:range", "10"),
  "SENSE:VOLTAGE:AC:RANGE?": scalar("volt:ac:range", "10"),
  "SENSE:VOLTAGE:AC:RANGE:AUTO": boolScalar("volt:ac:auto"),
  "SENSE:VOLTAGE:AC:RANGE:AUTO?": boolScalar("volt:ac:auto"),
  "SENSE:VOLTAGE:AC:NPLC": scalar("volt:ac:nplc", "1"),
  "SENSE:VOLTAGE:AC:NPLC?": scalar("volt:ac:nplc", "1"),
  "SENSE:CURRENT:DC:RANGE": scalar("curr:range", "1"),
  "SENSE:CURRENT:DC:RANGE?": scalar("curr:range", "1"),
  "SENSE:CURRENT:DC:RANGE:AUTO": boolScalar("curr:auto"),
  "SENSE:CURRENT:DC:RANGE:AUTO?": boolScalar("curr:auto"),
  "SENSE:CURRENT:DC:NPLC": scalar("curr:nplc", "1"),
  "SENSE:CURRENT:DC:NPLC?": scalar("curr:nplc", "1"),
  "SENSE:RESISTANCE:RANGE": scalar("res:range", "1000"),
  "SENSE:RESISTANCE:RANGE?": scalar("res:range", "1000"),
  "SENSE:RESISTANCE:RANGE:AUTO": boolScalar("res:auto"),
  "SENSE:RESISTANCE:RANGE:AUTO?": boolScalar("res:auto"),
  "SENSE:RESISTANCE:NPLC": scalar("res:nplc", "1"),
  "SENSE:RESISTANCE:NPLC?": scalar("res:nplc", "1"),
  "SENSE:FRESISTANCE:RANGE": scalar("fres:range", "1000"),
  "SENSE:FRESISTANCE:RANGE?": scalar("fres:range", "1000"),
  "SENSE:FRESISTANCE:RANGE:AUTO": boolScalar("fres:auto"),
  "SENSE:FRESISTANCE:RANGE:AUTO?": boolScalar("fres:auto"),
  "SENSE:FRESISTANCE:NPLC": scalar("fres:nplc", "1"),
  "SENSE:FRESISTANCE:NPLC?": scalar("fres:nplc", "1"),
  "DISPLAY:WINDOW2:STATE": boolScalar("window2:state"),
  "DISPLAY:WINDOW2:STATE?": boolScalar("window2:state"),
  "DISPLAY:WINDOW2:FUNCTION": scalar("window2:function", "VOLT:AC"),
  "DISPLAY:WINDOW2:FUNCTION?": scalar("window2:function", "VOLT:AC"),
  "CALCULATE:STATE": boolScalar("calc:state"),
  "CALCULATE:STATE?": boolScalar("calc:state"),
  "CALCULATE:FUNCTION": scalar("calc:function", "NULL"),
  "CALCULATE:FUNCTION?": scalar("calc:function", "NULL"),
  "CALCULATE:NULL:OFFSET": scalar("calc:null:offset", "0"),
  "CALCULATE:NULL:OFFSET?": scalar("calc:null:offset", "0"),
  "CALCULATE:DBM:REFERENCE": scalar("calc:dbm:reference", "600"),
  "CALCULATE:DBM:REFERENCE?": scalar("calc:dbm:reference", "600"),
  "CALCULATE:LIMIT:UPPER": scalar("calc:limit:upper", "0"),
  "CALCULATE:LIMIT:UPPER?": scalar("calc:limit:upper", "0"),
  "CALCULATE:LIMIT:LOWER": scalar("calc:limit:lower", "0"),
  "CALCULATE:LIMIT:LOWER?": scalar("calc:limit:lower", "0"),
  "CALCULATE:AVERAGE:CLEAR": (): CommandResult => ({ kind: "none" }),
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '+0,"No error"',
  }),
};

export const fluke8845aPersonality: SimulatorPersonality = {
  id: "fluke-8845a",
  kind: "multimeter",
  idn: "FLUKE,8845A,{serial},4.2",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
