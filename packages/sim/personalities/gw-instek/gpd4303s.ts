import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek GPD-4303S — economy 4-channel linear PSU.
 *
 * Reduced SCPI surface: no OVP/OCP, no preset memory. Identical
 * channel-addressed tree to GPP but rejects `:MEMory:*` and
 * `:CHANnel<n>:OVP:*` / `:OCP:*` writes — the simulator replies with
 * a SCPI error.
 */

const CHANNELS = [
  { id: 1, defaultV: "0.000" },
  { id: 2, defaultV: "0.000" },
  { id: 3, defaultV: "5.000" },
  { id: 4, defaultV: "0.000" },
];

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (const ch of CHANNELS) {
    s.set(`ch${ch.id}:volt`, ch.defaultV);
    s.set(`ch${ch.id}:curr`, "1.000");
    s.set(`ch${ch.id}:out`, "0");
  }
  return s;
}

function channelSet(key: string, fallback: string): CommandHandler {
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

const voltageHandler = channelSet("volt", "0.000");
const currentHandler = channelSet("curr", "1.000");

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
  return { kind: "line", text: on ? "0.050" : "0.000" };
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  { pattern: /^CHANNEL[1-4]:VOLTAGE(\?)?$/, handler: voltageHandler },
  { pattern: /^CHANNEL[1-4]:CURRENT(\?)?$/, handler: currentHandler },
  { pattern: /^OUTPUT[1-4]:STATE(\?)?$/, handler: outputHandler },
  { pattern: /^MEASURE[1-4]:(VOLTAGE|CURRENT)\?$/, handler: measureHandler },
];

const exactHandlers: Record<string, CommandHandler> = {
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

export const gwInstekGpd4303sPersonality: SimulatorPersonality = {
  id: "gwinstek-gpd4303s",
  kind: "powerSupply",
  idn: "GW Instek,GPD-4303S,{serial},V1.04",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
