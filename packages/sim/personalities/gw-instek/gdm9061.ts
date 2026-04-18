import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek GDM-9061 — 6½-digit bench DMM with dual display and
 * optional temperature transducers.
 *
 * SCPI surface tracks IVI-4.8:
 *   - `CONFigure:<fn>` + `SENSe:FUNCtion?`.
 *   - `READ?` returns the current reading.
 *   - `SENSe:<fn>:RANGe[:AUTO]` + `SENSe:<fn>:NPLC`.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("func", "VOLT");
  s.set("volt:range", "10");
  s.set("volt:auto", "1");
  s.set("volt:nplc", "1");
  s.set("curr:range", "1");
  s.set("curr:auto", "1");
  s.set("curr:nplc", "1");
  s.set("res:range", "1000");
  s.set("res:auto", "1");
  s.set("res:nplc", "1");
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

function configure(token: string): CommandHandler {
  return (_cmd, ctx): CommandResult => {
    ctx.state.set("func", token);
    return { kind: "none" };
  };
}

const exactHandlers: Record<string, CommandHandler> = {
  "CONFIGURE:VOLTAGE:DC": configure("VOLT"),
  "CONFIGURE:VOLTAGE:AC": configure("VOLT:AC"),
  "CONFIGURE:CURRENT:DC": configure("CURR"),
  "CONFIGURE:CURRENT:AC": configure("CURR:AC"),
  "CONFIGURE:RESISTANCE": configure("RES"),
  "CONFIGURE:FRESISTANCE": configure("FRES"),
  "CONFIGURE:FREQUENCY": configure("FREQ"),
  "CONFIGURE:PERIOD": configure("PER"),
  "CONFIGURE:CAPACITANCE": configure("CAP"),
  "CONFIGURE:CONTINUITY": configure("CONT"),
  "CONFIGURE:DIODE": configure("DIOD"),
  "CONFIGURE:TEMPERATURE": configure("TEMP"),
  "SENSE:FUNCTION?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: `"${String(ctx.state.get("func") ?? "VOLT")}"`,
  }),
  "READ?": (_cmd, ctx): CommandResult => {
    const fn = String(ctx.state.get("func") ?? "VOLT").toUpperCase();
    if (fn.startsWith("VOLT")) return { kind: "line", text: "+1.23456789E+00" };
    if (fn.startsWith("CURR")) return { kind: "line", text: "+1.00000000E-03" };
    if (fn.startsWith("RES") || fn.startsWith("FRES")) {
      return { kind: "line", text: "+1.00000000E+03" };
    }
    if (fn.startsWith("FREQ")) return { kind: "line", text: "+1.00000000E+03" };
    if (fn.startsWith("CAP")) return { kind: "line", text: "+1.00000000E-06" };
    if (fn.startsWith("TEMP")) return { kind: "line", text: "+2.50000000E+01" };
    return { kind: "line", text: "+0.00000000E+00" };
  },
  "SENSE:VOLTAGE:DC:RANGE": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE?": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO?": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:NPLC": scalar("volt:nplc", "1"),
  "SENSE:VOLTAGE:DC:NPLC?": scalar("volt:nplc", "1"),
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
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

export const gwInstekGdm9061Personality: SimulatorPersonality = {
  id: "gwinstek-gdm9061",
  kind: "multimeter",
  idn: "GW Instek,GDM-9061,{serial},V1.23",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
