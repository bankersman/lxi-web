import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * R&S / Hameg HMC8012 — 5¾-digit bench DMM.
 *
 * SCPI tree follows IVI-4.8: `CONFigure:<fn>` sets the active mode,
 * `READ?` returns the latest sample, `SENSe:<fn>:RANGe[:AUTO]` and
 * `SENSe:<fn>:NPLCycles` handle range/integration. `SENSe:FUNCtion?`
 * returns a quoted token (`"VOLT"`, `"CURR:AC"`, ...) which the driver
 * decodes.
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
  "CONFIGURE:CAPACITANCE": configureMode("CAP"),
  "CONFIGURE:CONTINUITY": configureMode("CONT"),
  "CONFIGURE:DIODE": configureMode("DIOD"),
  "CONFIGURE:TEMPERATURE": configureMode("TEMP"),
  "SENSE:FUNCTION?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: `"${String(ctx.state.get("function") ?? "VOLT")}"`,
  }),
  "READ?": (_cmd, ctx): CommandResult => {
    const fn = String(ctx.state.get("function") ?? "VOLT").toUpperCase();
    if (fn.startsWith("VOLT")) return { kind: "line", text: "1.23456E+00" };
    if (fn.startsWith("CURR")) return { kind: "line", text: "1.00000E-02" };
    if (fn.startsWith("RES") || fn.startsWith("FRES"))
      return { kind: "line", text: "1.00000E+02" };
    if (fn.startsWith("FREQ")) return { kind: "line", text: "5.00000E+01" };
    return { kind: "line", text: "0.00000E+00" };
  },
  "SENSE:VOLTAGE:DC:RANGE": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE?": scalar("volt:range", "10"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:RANGE:AUTO?": boolScalar("volt:auto"),
  "SENSE:VOLTAGE:DC:NPLCYCLES": scalar("volt:nplc", "10"),
  "SENSE:VOLTAGE:DC:NPLCYCLES?": scalar("volt:nplc", "10"),
  "SENSE:VOLTAGE:AC:RANGE": scalar("volt:ac:range", "10"),
  "SENSE:VOLTAGE:AC:RANGE?": scalar("volt:ac:range", "10"),
  "SENSE:VOLTAGE:AC:RANGE:AUTO": boolScalar("volt:ac:auto"),
  "SENSE:VOLTAGE:AC:RANGE:AUTO?": boolScalar("volt:ac:auto"),
  "SENSE:CURRENT:DC:RANGE": scalar("curr:range", "1"),
  "SENSE:CURRENT:DC:RANGE?": scalar("curr:range", "1"),
  "SENSE:CURRENT:DC:RANGE:AUTO": boolScalar("curr:auto"),
  "SENSE:CURRENT:DC:RANGE:AUTO?": boolScalar("curr:auto"),
  "SENSE:RESISTANCE:RANGE": scalar("res:range", "1000"),
  "SENSE:RESISTANCE:RANGE?": scalar("res:range", "1000"),
  "SENSE:RESISTANCE:RANGE:AUTO": boolScalar("res:auto"),
  "SENSE:RESISTANCE:RANGE:AUTO?": boolScalar("res:auto"),
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

export const rndsHmc8012Personality: SimulatorPersonality = {
  id: "rnds-hmc8012",
  kind: "multimeter",
  idn: "Rohde&Schwarz,HMC8012,{serial},FV:1.500",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
