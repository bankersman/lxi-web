import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../../src/personality.js";

/**
 * Shared command table for Keysight E36xxx / EDU36xxx PSU personalities.
 *
 * The family uses `INSTrument:NSELect <n>` to park a logical channel
 * selector; subsequent scalar setpoint / measure commands operate on
 * whatever channel was last selected. Per-session state therefore
 * carries a `selected` number plus a map of per-channel values.
 *
 * SCPI knobs mirrored here:
 *   - `INSTrument:NSELect <n>` / `?`
 *   - `VOLTage <V>` / `?`, `CURRent <A>` / `?` — write to current selector.
 *   - `OUTPut:STATe` / `?` — write to current selector.
 *   - `MEASure:SCALar:VOLTage:DC?` / `:CURRent:DC?` — echo setpoint when
 *     output is on, zero when off. Hi-Z behaviour like the Siglent SPD.
 *   - `OUTPut:PAIR`, `OUTPut:TRACk` — single-shared state bucket.
 *   - `VOLTage:PROTection*` / `CURRent:PROTection*` — per-channel.
 *   - `*SAV` / `*RCL` — acknowledge but don't persist anything.
 */

export interface E36ChannelDef {
  readonly id: number;
  readonly voltageMax: number;
  readonly currentMax: number;
}

export interface E36PersonalityConfig {
  readonly id: string;
  readonly idn: string;
  readonly opt?: string;
  readonly fixture: PersonalityFixture;
  readonly channels: readonly E36ChannelDef[];
  readonly supportsPairing: boolean;
}

function defaultState(channels: readonly E36ChannelDef[]): () => Map<string, unknown> {
  return () => {
    const s = new Map<string, unknown>();
    s.set("selected", channels[0]?.id ?? 1);
    for (const ch of channels) {
      s.set(`ch${ch.id}:volt`, "0.000");
      s.set(`ch${ch.id}:curr`, "0.100");
      s.set(`ch${ch.id}:out`, "0");
      s.set(`ch${ch.id}:ovp:state`, "0");
      s.set(`ch${ch.id}:ovp:level`, String(Math.abs(ch.voltageMax)));
      s.set(`ch${ch.id}:ocp:state`, "0");
      s.set(`ch${ch.id}:ocp:level`, String(ch.currentMax));
    }
    s.set("pair", "NONE");
    s.set("track", "0");
    return s;
  };
}

function selected(ctx: { state: Map<string, unknown> }): number {
  const v = ctx.state.get("selected");
  return typeof v === "number" ? v : Number(v) || 1;
}

const nselectHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(selected(ctx)) };
  }
  const n = Number.parseInt(cmd.args[0] ?? "1", 10);
  ctx.state.set("selected", Number.isFinite(n) ? n : 1);
  return { kind: "none" };
};

function scalarHandler(
  suffix: "volt" | "curr",
  fallback: string,
): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const ch = selected(ctx);
    const key = `ch${ch}:${suffix}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

const outputStateHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  const key = `ch${ch}:out`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
  }
  const arg = (cmd.args[0] ?? "OFF").toUpperCase();
  ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
  return { kind: "none" };
};

const measureHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  const on = ctx.state.get(`ch${ch}:out`) === "1";
  if (cmd.normalized.includes("VOLTAGE")) {
    return { kind: "line", text: on ? String(ctx.state.get(`ch${ch}:volt`) ?? "0.000") : "0.000" };
  }
  return { kind: "line", text: "0.000" };
};

const protectionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  const kind = cmd.normalized.startsWith("VOLTAGE:PROT") ? "ovp" : "ocp";
  if (cmd.normalized.endsWith(":CLEAR")) {
    return { kind: "none" };
  }
  if (cmd.normalized.includes(":STATE")) {
    const key = `ch${ch}:${kind}:state`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
    }
    const on = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(key, on === "ON" || on === "1" ? "1" : "0");
    return { kind: "none" };
  }
  if (cmd.normalized.endsWith(":TRIPPED?")) {
    return { kind: "line", text: "0" };
  }
  // LEVel (no qualifier)
  const key = `ch${ch}:${kind}:level`;
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
  }
  ctx.state.set(key, cmd.args[0] ?? "0");
  return { kind: "none" };
};

const pairHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("pair") ?? "NONE") };
  }
  const arg = (cmd.args[0] ?? "NONE").toUpperCase();
  ctx.state.set("pair", arg.startsWith("SER") ? "SER" : arg.startsWith("PAR") ? "PAR" : "NONE");
  return { kind: "none" };
};

const trackHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("track") ?? "0") };
  }
  const arg = (cmd.args[0] ?? "OFF").toUpperCase();
  ctx.state.set("track", arg === "ON" || arg === "1" ? "1" : "0");
  return { kind: "none" };
};

const noop: CommandHandler = (): CommandResult => ({ kind: "none" });

export function buildE36Personality(config: E36PersonalityConfig): SimulatorPersonality {
  const exactHandlers: Record<string, CommandHandler> = {
    "INSTRUMENT:NSELECT": nselectHandler,
    "INSTRUMENT:NSELECT?": nselectHandler,
    "VOLTAGE": scalarHandler("volt", "0.000"),
    "VOLTAGE?": scalarHandler("volt", "0.000"),
    "CURRENT": scalarHandler("curr", "0.100"),
    "CURRENT?": scalarHandler("curr", "0.100"),
    "OUTPUT:STATE": outputStateHandler,
    "OUTPUT:STATE?": outputStateHandler,
    "MEASURE:SCALAR:VOLTAGE:DC?": measureHandler,
    "MEASURE:SCALAR:CURRENT:DC?": measureHandler,
    "MEASURE:VOLTAGE?": measureHandler,
    "MEASURE:CURRENT?": measureHandler,
    "VOLTAGE:PROTECTION:STATE": protectionHandler,
    "VOLTAGE:PROTECTION:STATE?": protectionHandler,
    "VOLTAGE:PROTECTION:LEVEL": protectionHandler,
    "VOLTAGE:PROTECTION:LEVEL?": protectionHandler,
    "VOLTAGE:PROTECTION:TRIPPED?": protectionHandler,
    "VOLTAGE:PROTECTION:CLEAR": protectionHandler,
    "CURRENT:PROTECTION:STATE": protectionHandler,
    "CURRENT:PROTECTION:STATE?": protectionHandler,
    "CURRENT:PROTECTION:LEVEL": protectionHandler,
    "CURRENT:PROTECTION:LEVEL?": protectionHandler,
    "CURRENT:PROTECTION:TRIPPED?": protectionHandler,
    "CURRENT:PROTECTION:CLEAR": protectionHandler,
    "OUTPUT:TRACK": trackHandler,
    "OUTPUT:TRACK?": trackHandler,
  };
  if (config.supportsPairing) {
    exactHandlers["OUTPUT:PAIR"] = pairHandler;
    exactHandlers["OUTPUT:PAIR?"] = pairHandler;
  }
  const prefixHandlers: readonly PrefixHandlerEntry[] = [
    // `*SAV 3` / `*RCL 3` parse as header `*SAV` with args — both arrive
    // without colons; the simulator's commonExactHandlers handles `*SAV?`
    // variants. We just acknowledge writes.
    { pattern: /^\*SAV$/, handler: noop },
    { pattern: /^\*RCL$/, handler: noop },
  ];
  return {
    id: config.id,
    kind: "powerSupply",
    idn: config.idn,
    opt: config.opt ?? "",
    fixture: config.fixture,
    exactHandlers,
    prefixHandlers,
    initialState: defaultState(config.channels),
  };
}
