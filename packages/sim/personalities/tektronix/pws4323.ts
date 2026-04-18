import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Tektronix PWS4323 — triple-output programmable bench PSU.
 *
 * SCPI surface follows the PWS4000 programmer's manual:
 *   - `INSTrument:SELect OUT<n>` switches the active channel.
 *   - `VOLT`, `CURR`, `OUTP`, `MEAS:VOLT?`, `MEAS:CURR?` address the
 *     active channel only.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("selected", "OUT1");
  for (const id of [1, 2, 3]) {
    s.set(`out${id}:set:v`, id === 3 ? "5.000" : "0.000");
    s.set(`out${id}:set:i`, "1.000");
    s.set(`out${id}:state`, "0");
  }
  return s;
}

function activeChannelId(state: Map<string, unknown>): number {
  const sel = String(state.get("selected") ?? "OUT1").toUpperCase();
  const m = /OUT([123])/.exec(sel);
  return m ? Number.parseInt(m[1]!, 10) : 1;
}

const exactHandlers: Record<string, CommandHandler> = {
  "INSTRUMENT:SELECT": (cmd, ctx): CommandResult => {
    const arg = (cmd.args[0] ?? "OUT1").toUpperCase();
    ctx.state.set("selected", arg);
    return { kind: "none" };
  },
  "INSTRUMENT:SELECT?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: String(ctx.state.get("selected") ?? "OUT1"),
  }),
  VOLTAGE: (cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    ctx.state.set(`out${id}:set:v`, cmd.args[0] ?? "0");
    return { kind: "none" };
  },
  "VOLTAGE?": (_cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    return { kind: "line", text: String(ctx.state.get(`out${id}:set:v`) ?? "0") };
  },
  CURRENT: (cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    ctx.state.set(`out${id}:set:i`, cmd.args[0] ?? "0");
    return { kind: "none" };
  },
  "CURRENT?": (_cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    return { kind: "line", text: String(ctx.state.get(`out${id}:set:i`) ?? "0") };
  },
  OUTPUT: (cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(`out${id}:state`, arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  },
  "OUTPUT?": (_cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    return { kind: "line", text: String(ctx.state.get(`out${id}:state`) ?? "0") };
  },
  "MEASURE:VOLTAGE?": (_cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    const on = String(ctx.state.get(`out${id}:state`) ?? "0") === "1";
    const set = Number.parseFloat(String(ctx.state.get(`out${id}:set:v`) ?? "0"));
    return {
      kind: "line",
      text: on ? set.toFixed(4) : "0.0000",
    };
  },
  "MEASURE:CURRENT?": (_cmd, ctx): CommandResult => {
    const id = activeChannelId(ctx.state);
    const on = String(ctx.state.get(`out${id}:state`) ?? "0") === "1";
    return { kind: "line", text: on ? "0.1000" : "0.0000" };
  },
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

export const tektronixPws4323Personality: SimulatorPersonality = {
  id: "tektronix-pws4323",
  kind: "powerSupply",
  idn: "TEKTRONIX,PWS4323,{serial},FV:1.10",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
