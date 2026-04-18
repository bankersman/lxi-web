import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Rohde & Schwarz NGE103B — triple-output bench PSU.
 *
 * Channel selection goes through `INSTrument:SELect OUT<n>`; every
 * subsequent `SOURce:*` / `MEASure:*` call addresses the active rail.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("selected", 1);
  for (const id of [1, 2, 3]) {
    s.set(`out${id}:set:v`, id === 1 ? "5.000" : "0.000");
    s.set(`out${id}:set:i`, "1.000");
    s.set(`out${id}:state`, "0");
    s.set(`out${id}:ovp:level`, "33.0");
    s.set(`out${id}:ovp:state`, "0");
    s.set(`out${id}:ovp:tripped`, "0");
    s.set(`out${id}:ocp:level`, "3.5");
    s.set(`out${id}:ocp:state`, "0");
    s.set(`out${id}:ocp:tripped`, "0");
  }
  return s;
}

function active(ctx: { state: Map<string, unknown> }): number {
  const raw = ctx.state.get("selected");
  if (typeof raw === "number") return raw;
  const str = String(raw ?? "1").toUpperCase();
  const m = /OUT([123])/.exec(str);
  return m ? Number.parseInt(m[1]!, 10) : 1;
}

function setSelected(cmd: { args: readonly string[] }, ctx: { state: Map<string, unknown> }) {
  const arg = (cmd.args[0] ?? "OUT1").toUpperCase();
  const m = /OUT([123])/.exec(arg);
  ctx.state.set("selected", m ? Number.parseInt(m[1]!, 10) : 1);
}

function passivePut(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const id = active(ctx);
    const full = `out${id}:${key}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(full) ?? fallback) };
    }
    ctx.state.set(full, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function boolPut(key: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const id = active(ctx);
    const full = `out${id}:${key}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(full) ?? "0") };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(full, arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  };
}

const exactHandlers: Record<string, CommandHandler> = {
  "INSTRUMENT:SELECT": (cmd, ctx): CommandResult => {
    setSelected(cmd, ctx);
    return { kind: "none" };
  },
  "INSTRUMENT:SELECT?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: `OUT${active(ctx)}`,
  }),
  "SOURCE:VOLTAGE": passivePut("set:v", "0.000"),
  "SOURCE:VOLTAGE?": passivePut("set:v", "0.000"),
  "SOURCE:CURRENT": passivePut("set:i", "1.000"),
  "SOURCE:CURRENT?": passivePut("set:i", "1.000"),
  "OUTPUT:STATE": boolPut("state"),
  "OUTPUT:STATE?": boolPut("state"),
  "MEASURE:SCALAR:VOLTAGE?": (_cmd, ctx): CommandResult => {
    const id = active(ctx);
    const on = String(ctx.state.get(`out${id}:state`) ?? "0") === "1";
    const v = Number.parseFloat(String(ctx.state.get(`out${id}:set:v`) ?? "0"));
    return { kind: "line", text: on ? v.toFixed(4) : "0.0000" };
  },
  "MEASURE:SCALAR:CURRENT?": (_cmd, ctx): CommandResult => {
    const id = active(ctx);
    const on = String(ctx.state.get(`out${id}:state`) ?? "0") === "1";
    return { kind: "line", text: on ? "0.1000" : "0.0000" };
  },
  "SOURCE:VOLTAGE:PROTECTION:LEVEL": passivePut("ovp:level", "33.0"),
  "SOURCE:VOLTAGE:PROTECTION:LEVEL?": passivePut("ovp:level", "33.0"),
  "SOURCE:VOLTAGE:PROTECTION:STATE": boolPut("ovp:state"),
  "SOURCE:VOLTAGE:PROTECTION:STATE?": boolPut("ovp:state"),
  "SOURCE:VOLTAGE:PROTECTION:TRIPPED?": passivePut("ovp:tripped", "0"),
  "SOURCE:VOLTAGE:PROTECTION:CLEAR": (_cmd, ctx): CommandResult => {
    const id = active(ctx);
    ctx.state.set(`out${id}:ovp:tripped`, "0");
    return { kind: "none" };
  },
  "SOURCE:CURRENT:PROTECTION:LEVEL": passivePut("ocp:level", "3.5"),
  "SOURCE:CURRENT:PROTECTION:LEVEL?": passivePut("ocp:level", "3.5"),
  "SOURCE:CURRENT:PROTECTION:STATE": boolPut("ocp:state"),
  "SOURCE:CURRENT:PROTECTION:STATE?": boolPut("ocp:state"),
  "SOURCE:CURRENT:PROTECTION:TRIPPED?": passivePut("ocp:tripped", "0"),
  "SOURCE:CURRENT:PROTECTION:CLEAR": (_cmd, ctx): CommandResult => {
    const id = active(ctx);
    ctx.state.set(`out${id}:ocp:tripped`, "0");
    return { kind: "none" };
  },
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

export const rndsNge103bPersonality: SimulatorPersonality = {
  id: "rnds-nge103b",
  kind: "powerSupply",
  idn: "Rohde&Schwarz,NGE103B,{serial},FV:1.42",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
