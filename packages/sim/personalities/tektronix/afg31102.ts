import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Tektronix AFG31102 — 2-channel / 100 MHz / 1 GSa/s signal generator.
 *
 * SCPI surface matches the AFG31000 programmer's manual:
 *   - `SOURce<n>:FUNCtion|:FREQuency|:VOLTage|:VOLTage:OFFSet|:PHASe`
 *   - `OUTPut<n>:STATe`, `OUTPut<n>:IMPedance`
 *   - `*SAV` / `*RCL`, `*IDN?`, `*OPT?`, `SYSTem:ERRor?`
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 2; ch++) {
    s.set(`src${ch}:function`, "SIN");
    s.set(`src${ch}:frequency`, "1.0000E+03");
    s.set(`src${ch}:voltage`, "1.0000E+00");
    s.set(`src${ch}:voltage:offset`, "0.0000E+00");
    s.set(`src${ch}:phase`, "0.0000E+00");
    s.set(`out${ch}:state`, "0");
    s.set(`out${ch}:impedance`, "50");
  }
  return s;
}

function srcHandler(
  pattern: RegExp,
  property: string,
  fallback: string,
): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `src${channel}:${property}`;
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
      }
      const arg = cmd.args[0];
      if (arg !== undefined) ctx.state.set(key, arg);
      return { kind: "none" };
    },
  };
}

function outHandler(
  pattern: RegExp,
  property: string,
  fallback: string,
): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `out${channel}:${property}`;
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
      }
      const arg = cmd.args[0];
      if (arg !== undefined) {
        if (property === "state") {
          ctx.state.set(
            key,
            arg.toUpperCase() === "ON" || arg === "1" ? "1" : "0",
          );
        } else {
          ctx.state.set(key, arg);
        }
      }
      return { kind: "none" };
    },
  };
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
  srcHandler(/^SOURCE([12]):FUNCTION\??$/, "function", "SIN"),
  srcHandler(/^SOURCE([12]):FREQUENCY\??$/, "frequency", "1.0000E+03"),
  srcHandler(/^SOURCE([12]):VOLTAGE\??$/, "voltage", "1.0000E+00"),
  srcHandler(/^SOURCE([12]):VOLTAGE:OFFSET\??$/, "voltage:offset", "0.0000E+00"),
  srcHandler(/^SOURCE([12]):PHASE\??$/, "phase", "0.0000E+00"),
  srcHandler(/^SOURCE([12]):PULSE:DCYCLE\??$/, "pulse:dcycle", "50"),
  srcHandler(/^SOURCE([12]):PULSE:WIDTH\??$/, "pulse:width", "1.0E-07"),
  outHandler(/^OUTPUT([12]):STATE\??$/, "state", "0"),
  outHandler(/^OUTPUT([12]):IMPEDANCE\??$/, "impedance", "50"),
];

export const tektronixAfg31102Personality: SimulatorPersonality = {
  id: "tektronix-afg31102",
  kind: "signalGenerator",
  idn: "TEKTRONIX,AFG31102,{serial},FV:1.6.5",
  opt: "ARB+",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
