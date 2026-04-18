import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek PSW 30-36 — single-channel programmable switching PSU.
 *
 * PSW SCPI uses the single-channel `SOURce:*` tree:
 *   - `SOURce:VOLTage <v>` / `SOURce:VOLTage?`
 *   - `SOURce:CURRent <a>` / `SOURce:CURRent?`
 *   - `OUTPut ON|OFF` / `OUTPut?`
 *   - `MEASure:VOLTage?` / `MEASure:CURRent?`
 *   - `SOURce:VOLTage:PROTection:LEVel` etc.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("volt", "0.000");
  s.set("curr", "1.000");
  s.set("out", "0");
  s.set("ovp:level", "33.0");
  s.set("ovp:state", "0");
  s.set("ovp:tripped", "0");
  s.set("ocp:level", "37.0");
  s.set("ocp:state", "0");
  s.set("ocp:tripped", "0");
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
  "SOURCE:VOLTAGE": scalar("volt", "0.000"),
  "SOURCE:VOLTAGE?": scalar("volt", "0.000"),
  "SOURCE:CURRENT": scalar("curr", "1.000"),
  "SOURCE:CURRENT?": scalar("curr", "1.000"),
  OUTPUT: boolScalar("out"),
  "OUTPUT?": boolScalar("out"),
  "MEASURE:VOLTAGE?": (_cmd, ctx): CommandResult => {
    const on = ctx.state.get("out") === "1";
    return {
      kind: "line",
      text: on ? String(ctx.state.get("volt") ?? "0.000") : "0.000",
    };
  },
  "MEASURE:CURRENT?": (_cmd, ctx): CommandResult => {
    const on = ctx.state.get("out") === "1";
    return { kind: "line", text: on ? "5.000" : "0.000" };
  },
  "SOURCE:OVP:LEVEL": scalar("ovp:level", "33.0"),
  "SOURCE:OVP:LEVEL?": scalar("ovp:level", "33.0"),
  "SOURCE:OVP:STATE": boolScalar("ovp:state"),
  "SOURCE:OVP:STATE?": boolScalar("ovp:state"),
  "SOURCE:OVP:TRIPPED?": scalar("ovp:tripped", "0"),
  "SOURCE:OVP:CLEAR": (_cmd, ctx): CommandResult => {
    ctx.state.set("ovp:tripped", "0");
    return { kind: "none" };
  },
  "SOURCE:OCP:LEVEL": scalar("ocp:level", "37.0"),
  "SOURCE:OCP:LEVEL?": scalar("ocp:level", "37.0"),
  "SOURCE:OCP:STATE": boolScalar("ocp:state"),
  "SOURCE:OCP:STATE?": boolScalar("ocp:state"),
  "SOURCE:OCP:TRIPPED?": scalar("ocp:tripped", "0"),
  "SOURCE:OCP:CLEAR": (_cmd, ctx): CommandResult => {
    ctx.state.set("ocp:tripped", "0");
    return { kind: "none" };
  },
  "MEMORY:SAVE": (): CommandResult => ({ kind: "none" }),
  "MEMORY:RECALL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

export const gwInstekPsw3036Personality: SimulatorPersonality = {
  id: "gwinstek-psw30-36",
  kind: "powerSupply",
  idn: "GW INSTEK,PSW30-36,{serial},V1.00",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
