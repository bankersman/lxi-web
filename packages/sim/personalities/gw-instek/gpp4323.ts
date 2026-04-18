import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek GPP-4323 — 4-channel linear PSU.
 *
 * SCPI surface (per GW Instek GPP programming guide):
 *   - `:CHANnel<n>:VOLTage <v>` / `:CHANnel<n>:VOLTage?`
 *   - `:CHANnel<n>:CURRent <a>` / `:CHANnel<n>:CURRent?`
 *   - `:OUTPut<n>:STATe ON|OFF` / `:OUTPut<n>:STATe?`
 *   - `:MEASure<n>:VOLTage?` / `:MEASure<n>:CURRent?`
 *   - `:CHANnel<n>:OVP:LEVel|STATe|TRIPped?|CLEar`
 *   - `:MEMory:SAVE <n>` / `:MEMory:RECall <n>`
 */

const CHANNELS: readonly {
  id: number;
  voltageMax: number;
  currentMax: number;
  defaultV: string;
}[] = [
  { id: 1, voltageMax: 32, currentMax: 3, defaultV: "0.000" },
  { id: 2, voltageMax: 32, currentMax: 3, defaultV: "0.000" },
  { id: 3, voltageMax: 6, currentMax: 1, defaultV: "5.000" },
  { id: 4, voltageMax: 15, currentMax: 1, defaultV: "0.000" },
];

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (const ch of CHANNELS) {
    s.set(`ch${ch.id}:volt`, ch.defaultV);
    s.set(`ch${ch.id}:curr`, "1.000");
    s.set(`ch${ch.id}:out`, "0");
    s.set(`ch${ch.id}:ovp:level`, String(ch.voltageMax * 1.05));
    s.set(`ch${ch.id}:ovp:state`, "0");
    s.set(`ch${ch.id}:ovp:tripped`, "0");
    s.set(`ch${ch.id}:ocp:level`, String(ch.currentMax * 1.05));
    s.set(`ch${ch.id}:ocp:state`, "0");
    s.set(`ch${ch.id}:ocp:tripped`, "0");
  }
  return s;
}

function channelSet(
  key: string,
  fallback: string,
): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const m = /^CHANNEL([1-4])/.exec(cmd.normalized);
    if (!m) return { kind: "none" };
    const ch = Number.parseInt(m[1]!, 10);
    const full = `ch${ch}:${key}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(full) ?? fallback) };
    }
    ctx.state.set(full, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

const voltageHandler: CommandHandler = channelSet("volt", "0.000");
const currentHandler: CommandHandler = channelSet("curr", "1.000");

const outputHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^OUTPUT([1-4]):STATE/.exec(cmd.normalized);
  if (!m) return { kind: "none" };
  const ch = Number.parseInt(m[1]!, 10);
  const full = `ch${ch}:out`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(full) ?? "0") };
  }
  const arg = (cmd.args[0] ?? "OFF").toUpperCase();
  ctx.state.set(full, arg === "ON" || arg === "1" ? "1" : "0");
  return { kind: "none" };
};

const measureHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^MEASURE([1-4]):(VOLTAGE|CURRENT)\?$/.exec(cmd.normalized);
  if (!m) return { kind: "line", text: "0.000" };
  const ch = Number.parseInt(m[1]!, 10);
  const on = ctx.state.get(`ch${ch}:out`) === "1";
  if (m[2] === "VOLTAGE") {
    const v = on ? String(ctx.state.get(`ch${ch}:volt`) ?? "0.000") : "0.000";
    return { kind: "line", text: v };
  }
  return { kind: "line", text: on ? "0.100" : "0.000" };
};

const protectionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = /^CHANNEL([1-4]):(OVP|OCP)(?::(LEVEL|STATE|TRIPPED|CLEAR))?(\??)$/.exec(
    cmd.normalized,
  );
  if (!m) return { kind: "none" };
  const ch = Number.parseInt(m[1]!, 10);
  const kind = m[2]!.toLowerCase();
  const suffix = m[3];
  if (suffix === "CLEAR") {
    ctx.state.set(`ch${ch}:${kind}:tripped`, "0");
    return { kind: "none" };
  }
  if (suffix === "TRIPPED") {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:${kind}:tripped`) ?? "0") };
  }
  if (suffix === "STATE") {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(`ch${ch}:${kind}:state`) ?? "0") };
    }
    const on = (cmd.args[0] ?? "OFF").toUpperCase() === "ON" ? "1" : "0";
    ctx.state.set(`ch${ch}:${kind}:state`, on);
    return { kind: "none" };
  }
  if (suffix === "LEVEL") {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(`ch${ch}:${kind}:level`) ?? "0") };
    }
    ctx.state.set(`ch${ch}:${kind}:level`, cmd.args[0] ?? "0");
    return { kind: "none" };
  }
  return { kind: "none" };
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  { pattern: /^CHANNEL[1-4]:VOLTAGE(\?)?$/, handler: voltageHandler },
  { pattern: /^CHANNEL[1-4]:CURRENT(\?)?$/, handler: currentHandler },
  { pattern: /^CHANNEL[1-4]:(OVP|OCP)/, handler: protectionHandler },
  { pattern: /^OUTPUT[1-4]:STATE(\?)?$/, handler: outputHandler },
  { pattern: /^MEASURE[1-4]:(VOLTAGE|CURRENT)\?$/, handler: measureHandler },
];

const exactHandlers: Record<string, CommandHandler> = {
  "MEMORY:SAVE": (): CommandResult => ({ kind: "none" }),
  "MEMORY:RECALL": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

export const gwInstekGpp4323Personality: SimulatorPersonality = {
  id: "gwinstek-gpp4323",
  kind: "powerSupply",
  idn: "GW Instek,GPP-4323,{serial},V1.10",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
