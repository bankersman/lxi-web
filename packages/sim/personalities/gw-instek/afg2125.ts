import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek AFG-2125 — single-channel 25 MHz arbitrary function gen.
 *
 * SCPI surface (SCPI-1999 SOURce<n> tree):
 *   - `SOURce<n>:FUNCtion SIN|SQU|RAMP|PULS|NOIS|DC|USER`
 *   - `SOURce<n>:FREQuency` / `:AMPLitude` / `:DCOffset` / `:PHASe`
 *   - `OUTPut<n>:STATe ON|OFF` / `OUTPut<n>:LOAD 50|INF`
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("ch1:func", "SIN");
  s.set("ch1:freq", "1.000E+03");
  s.set("ch1:amp", "1.000E+00");
  s.set("ch1:offset", "0.000E+00");
  s.set("ch1:phase", "0");
  s.set("ch1:out", "0");
  s.set("ch1:load", "50");
  return s;
}

function channelSet(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const m = /^SOURCE([1-2])/.exec(cmd.normalized);
    const ch = m ? Number.parseInt(m[1]!, 10) : 1;
    const full = `ch${ch}:${key}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(full) ?? fallback) };
    }
    ctx.state.set(full, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function outputSet(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const m = /^OUTPUT([1-2])/.exec(cmd.normalized);
    const ch = m ? Number.parseInt(m[1]!, 10) : 1;
    const full = `ch${ch}:${key}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(full) ?? fallback) };
    }
    if (key === "out") {
      const arg = (cmd.args[0] ?? "OFF").toUpperCase();
      ctx.state.set(full, arg === "ON" || arg === "1" ? "1" : "0");
      return { kind: "none" };
    }
    ctx.state.set(full, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

const funcHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^SOURCE([1-2]):FUNCTION(\??)$/.exec(cmd.normalized);
  const ch = m ? Number.parseInt(m[1]!, 10) : 1;
  const full = `ch${ch}:func`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(full) ?? "SIN") };
  }
  ctx.state.set(full, (cmd.args[0] ?? "SIN").toUpperCase());
  return { kind: "none" };
};

const freqHandler = channelSet("freq", "1.000E+03");
const ampHandler = channelSet("amp", "1.000E+00");
const offsetHandler = channelSet("offset", "0.000E+00");
const phaseHandler = channelSet("phase", "0");
const outputHandler = outputSet("out", "0");
const loadHandler = outputSet("load", "50");

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  { pattern: /^SOURCE[1-2]:FUNCTION(\?)?$/, handler: funcHandler },
  { pattern: /^SOURCE[1-2]:FREQUENCY(\?)?$/, handler: freqHandler },
  { pattern: /^SOURCE[1-2]:AMPLITUDE(\?)?$/, handler: ampHandler },
  { pattern: /^SOURCE[1-2]:DCOFFSET(\?)?$/, handler: offsetHandler },
  { pattern: /^SOURCE[1-2]:PHASE(\?)?$/, handler: phaseHandler },
  { pattern: /^OUTPUT[1-2]:STATE(\?)?$/, handler: outputHandler },
  { pattern: /^OUTPUT[1-2]:LOAD(\?)?$/, handler: loadHandler },
];

const exactHandlers: Record<string, CommandHandler> = {
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

export const gwInstekAfg2125Personality: SimulatorPersonality = {
  id: "gwinstek-afg2125",
  kind: "signalGenerator",
  idn: "GW Instek,AFG-2125,{serial},V1.02",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
