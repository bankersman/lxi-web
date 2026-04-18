import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "spd3303x-e.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Siglent SPD3303X-E personality. Three-channel PSU state-carrying
 * simulator: setpoints + output gates per channel, tracking mode
 * read / write, pass-through for protection commands (mirrors what the
 * real unit does — it accepts OVP writes but never trips in the
 * simulator).
 *
 * SCPI matches the SPD programming guide:
 *   - `CH<n>:VOLTage <V>` / `CH<n>:VOLTage?` — setpoint getter/setter.
 *   - `CH<n>:CURRent <A>` / `CH<n>:CURRent?`.
 *   - `OUTPut CH<n>,ON|OFF` — gate (channel tag lives in `args[0]`).
 *   - `OUTPut? CH<n>` — gate state read-back.
 *   - `MEASure:VOLTage? CH<n>` — measured voltage (we echo the
 *     setpoint, which mimics the unit loaded into Hi-Z).
 *   - `OUTPut:TRACk <0|1|2>` — 0 off / 1 parallel / 2 series.
 */

const V_MAX_CH12 = 32;
const I_MAX_CH12 = 3.2;
const V_MAX_CH3 = 5;
const I_MAX_CH3 = 3.2;

function limitVoltage(ch: number, raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  const max = ch === 3 ? V_MAX_CH3 : V_MAX_CH12;
  return String(Math.max(0, Math.min(max, n)));
}

function limitCurrent(ch: number, raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  const max = ch === 3 ? I_MAX_CH3 : I_MAX_CH12;
  return String(Math.max(0, Math.min(max, n)));
}

function parseChannelTag(tag: string | undefined): number | null {
  if (!tag) return null;
  const m = tag.toUpperCase().match(/^CH([1-3])$/);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (const ch of [1, 2, 3]) {
    s.set(`ch${ch}:volt`, ch === 3 ? "5.0" : "0.0");
    s.set(`ch${ch}:curr`, "0.5");
    s.set(`ch${ch}:out`, "0");
    s.set(`ch${ch}:ovp:state`, "0");
    s.set(`ch${ch}:ovp:level`, String(ch === 3 ? V_MAX_CH3 : V_MAX_CH12));
    s.set(`ch${ch}:ocp:state`, "0");
    s.set(`ch${ch}:ocp:level`, String(ch === 3 ? I_MAX_CH3 : I_MAX_CH12));
  }
  s.set("track", "0");
  return s;
}

const voltageHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = cmd.normalized.match(/^CH([1-3]):VOLTAGE(\??)$/);
  if (!m) return { kind: "none" };
  const ch = Number.parseInt(m[1]!, 10);
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:volt`) ?? "0.000") };
  }
  const arg = cmd.args[0] ?? "0";
  ctx.state.set(`ch${ch}:volt`, limitVoltage(ch, arg));
  return { kind: "none" };
};

const currentHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = cmd.normalized.match(/^CH([1-3]):CURRENT(\??)$/);
  if (!m) return { kind: "none" };
  const ch = Number.parseInt(m[1]!, 10);
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:curr`) ?? "0.000") };
  }
  const arg = cmd.args[0] ?? "0";
  ctx.state.set(`ch${ch}:curr`, limitCurrent(ch, arg));
  return { kind: "none" };
};

const outputHandler: CommandHandler = (cmd, ctx): CommandResult => {
  // `OUTP CH1,ON` — args[0] is the channel tag, args[1] is ON/OFF.
  if (cmd.isQuery) {
    const ch = parseChannelTag(cmd.args[0]);
    if (!ch) return { kind: "line", text: "0" };
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:out`) ?? "0") };
  }
  const ch = parseChannelTag(cmd.args[0]);
  if (!ch) return { kind: "none" };
  const state = (cmd.args[1] ?? "OFF").toUpperCase() === "ON" ? "1" : "0";
  ctx.state.set(`ch${ch}:out`, state);
  return { kind: "none" };
};

const measureHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const ch = parseChannelTag(cmd.args[0]);
  if (!ch) return { kind: "line", text: "0.000" };
  const on = ctx.state.get(`ch${ch}:out`) === "1";
  if (cmd.normalized.startsWith("MEASURE:VOLTAGE")) {
    const v = on ? String(ctx.state.get(`ch${ch}:volt`) ?? "0.000") : "0.000";
    return { kind: "line", text: v };
  }
  if (cmd.normalized.startsWith("MEASURE:CURRENT")) {
    // Hi-Z bench: no current drawn even when output is on.
    return { kind: "line", text: "0.000" };
  }
  // POWER
  return { kind: "line", text: "0.000" };
};

const trackHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("track") ?? "0") };
  }
  const arg = cmd.args[0] ?? "0";
  const n = Number.parseInt(arg, 10);
  ctx.state.set("track", String(Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0));
  return { kind: "none" };
};

const protectionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = cmd.normalized.match(
    /^CH([1-3]):(VOLTAGE|CURRENT):PROTECTION(?::(STATE|CLEAR))?(\??)$/,
  );
  if (!m) return { kind: "none" };
  const ch = Number.parseInt(m[1]!, 10);
  const kind = m[2] === "VOLTAGE" ? "ovp" : "ocp";
  const suffix = m[3];
  if (suffix === "CLEAR") {
    return { kind: "none" };
  }
  if (suffix === "STATE") {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(`ch${ch}:${kind}:state`) ?? "0") };
    }
    const on = (cmd.args[0] ?? "OFF").toUpperCase() === "ON" ? "1" : "0";
    ctx.state.set(`ch${ch}:${kind}:state`, on);
    return { kind: "none" };
  }
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`ch${ch}:${kind}:level`) ?? "0") };
  }
  ctx.state.set(`ch${ch}:${kind}:level`, cmd.args[0] ?? "0");
  return { kind: "none" };
};

const statusHandler: CommandHandler = (_cmd, ctx): CommandResult => {
  const ch1On = ctx.state.get("ch1:out") === "1" ? 1 : 0;
  const ch2On = ctx.state.get("ch2:out") === "1" ? 1 : 0;
  const status = (ch1On << 4) | (ch2On << 5);
  return { kind: "line", text: String(status) };
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  { pattern: /^CH[1-3]:VOLTAGE(\?)?$/, handler: voltageHandler },
  { pattern: /^CH[1-3]:CURRENT(\?)?$/, handler: currentHandler },
  { pattern: /^CH[1-3]:(VOLTAGE|CURRENT):PROTECTION/, handler: protectionHandler },
];

const exactHandlers: Readonly<Record<string, CommandHandler>> = {
  "OUTPUT": outputHandler,
  "OUTPUT?": outputHandler,
  "OUTPUT:TRACK": trackHandler,
  "OUTPUT:TRACK?": trackHandler,
  "MEASURE:VOLTAGE?": measureHandler,
  "MEASURE:CURRENT?": measureHandler,
  "MEASURE:POWER?": measureHandler,
  "SYSTEM:STATUS?": statusHandler,
};

export const siglentSpd3303xEPersonality: SimulatorPersonality = {
  id: "siglent-spd3303x-e",
  kind: "powerSupply",
  idn: "Siglent Technologies,SPD3303X-E,{serial},1.01.01.02,V1.3",
  opt: "",
  fixture,
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
