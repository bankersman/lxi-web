import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Rohde & Schwarz SMBV100A — vector signal generator (up to 6 GHz).
 *
 * The SMBV exposes a single RF port reached through `SOURce:FREQuency`
 * + `SOURce:POWer` (dBm) and toggled with `OUTPut:STATe`.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("freq", "1.00000000E+09");
  s.set("power", "-10.00");
  s.set("output", "0");
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
  "SOURCE:FREQUENCY": scalar("freq", "1.00000000E+09"),
  "SOURCE:FREQUENCY?": scalar("freq", "1.00000000E+09"),
  "SOURCE:POWER": scalar("power", "-10.00"),
  "SOURCE:POWER?": scalar("power", "-10.00"),
  "OUTPUT:STATE": boolScalar("output"),
  "OUTPUT:STATE?": boolScalar("output"),
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

export const rndsSmbv100aPersonality: SimulatorPersonality = {
  id: "rnds-smbv100a",
  kind: "signalGenerator",
  idn: "Rohde&Schwarz,SMBV100A,{serial},FV:3.20.390.14",
  opt: "K1,B10,B103",
  exactHandlers,
  initialState: defaultState,
};
