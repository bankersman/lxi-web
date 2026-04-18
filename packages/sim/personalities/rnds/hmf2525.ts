import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Hameg HMF2525 — single-channel 25 MHz arb/function generator.
 *
 * Firmware IDs as `HAMEG,HMF2525,…` so this simulator exercises the
 * legacy-manufacturer path into the `RndsHmf` driver. The `SOURce<n>`
 * / `OUTPut<n>` prefixes with `n ∈ {1}` are collapsed onto a single
 * state bag.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("function", "SIN");
  s.set("freq", "1.000000E+03");
  s.set("amp", "1.000");
  s.set("offset", "0.000");
  s.set("output", "0");
  s.set("load", "50");
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

function withAliases(
  pattern: RegExp,
  handler: CommandHandler,
): PrefixHandlerEntry {
  return { pattern, handler };
}

const exactHandlers: Record<string, CommandHandler> = {
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  withAliases(/^SOURCE1?:FUNCTION\??$/, scalar("function", "SIN")),
  withAliases(/^SOURCE1?:FREQUENCY\??$/, scalar("freq", "1.000000E+03")),
  withAliases(/^SOURCE1?:VOLTAGE\??$/, scalar("amp", "1.000")),
  withAliases(/^SOURCE1?:VOLTAGE:OFFSET\??$/, scalar("offset", "0.000")),
  withAliases(/^OUTPUT1?:STATE\??$/, boolScalar("output")),
  withAliases(/^OUTPUT1?:LOAD\??$/, scalar("load", "50")),
];

export const rndsHmf2525Personality: SimulatorPersonality = {
  id: "rnds-hmf2525",
  kind: "signalGenerator",
  idn: "HAMEG,HMF2525,{serial},FV:3.061",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
