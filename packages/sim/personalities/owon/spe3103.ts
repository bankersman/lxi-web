import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Owon SPE3103 — triple-output PSU simulator. Tracks the active
 * channel via `INSTrument:NSELect` and maintains per-channel voltage
 * setpoint, current setpoint, and output gate. Measurement replies
 * echo the setpoint when the channel is on and zero when off (the
 * Hi-Z bench convention used by the Siglent SPD personality).
 *
 * The programming guide for SPE says it does **not** expose OVP /
 * OCP, pairing, tracking, or presets over SCPI — none of those
 * handlers are mocked here; the firmware replies with `-113 Undefined
 * header` to them in the wild, which the simulator defaults to via
 * the fallthrough unknown-command path.
 */

const CHANNEL_LIMITS: Record<number, { v: number; i: number }> = {
  1: { v: 30, i: 3 },
  2: { v: 30, i: 3 },
  3: { v: 5, i: 3 },
};

function clamp(value: string, max: number): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return String(Math.max(0, Math.min(max, n)));
}

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("nsel", "1");
  for (const ch of [1, 2, 3]) {
    s.set(`ch${ch}:volt`, "0.0");
    s.set(`ch${ch}:curr`, "0.5");
    s.set(`ch${ch}:out`, "0");
  }
  return s;
}

function selected(ctx: { state: Map<string, unknown> }): number {
  const raw = ctx.state.get("nsel");
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1 || n > 3) return 1;
  return n;
}

const nselectHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("nsel") ?? "1") };
  }
  const n = Number.parseInt(cmd.args[0] ?? "1", 10);
  if (Number.isFinite(n) && n >= 1 && n <= 3) {
    ctx.state.set("nsel", String(n));
  }
  return { kind: "none" };
};

const voltageHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:volt`) ?? "0") };
  }
  const arg = cmd.args[0] ?? "0";
  const limit = CHANNEL_LIMITS[ch]!.v;
  ctx.state.set(`ch${ch}:volt`, clamp(arg, limit));
  return { kind: "none" };
};

const currentHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:curr`) ?? "0") };
  }
  const arg = cmd.args[0] ?? "0";
  const limit = CHANNEL_LIMITS[ch]!.i;
  ctx.state.set(`ch${ch}:curr`, clamp(arg, limit));
  return { kind: "none" };
};

const outputHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:out`) ?? "0") };
  }
  const on = (cmd.args[0] ?? "OFF").toUpperCase() === "ON" ? "1" : "0";
  ctx.state.set(`ch${ch}:out`, on);
  return { kind: "none" };
};

const measureVoltageHandler: CommandHandler = (_cmd, ctx): CommandResult => {
  const ch = selected(ctx);
  const on = ctx.state.get(`ch${ch}:out`) === "1";
  const v = on ? String(ctx.state.get(`ch${ch}:volt`) ?? "0") : "0";
  return { kind: "line", text: v };
};

const measureCurrentHandler: CommandHandler = (_cmd, _ctx): CommandResult => ({
  kind: "line",
  text: "0",
});

const exactHandlers: Record<string, CommandHandler> = {
  "INSTRUMENT:NSELECT": nselectHandler,
  "INSTRUMENT:NSELECT?": nselectHandler,
  VOLTAGE: voltageHandler,
  "VOLTAGE?": voltageHandler,
  CURRENT: currentHandler,
  "CURRENT?": currentHandler,
  OUTPUT: outputHandler,
  "OUTPUT?": outputHandler,
  "MEASURE:VOLTAGE?": measureVoltageHandler,
  "MEASURE:CURRENT?": measureCurrentHandler,
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '+0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [];

export const owonSpe3103Personality: SimulatorPersonality = {
  id: "owon-spe3103",
  kind: "powerSupply",
  idn: "OWON,SPE3103,{serial},V1.2.3",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
