import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  SimulatorPersonality,
} from "../../src/personality.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "el34243a.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight EL34243A personality — dual-channel electronic load
 * (150 V / 40 A / 300 W per channel). This personality focuses on the
 * single-channel surface the 4.7 driver exposes: input state + mode
 * + setpoints + measurements + OVP/OCP/OPP protection.
 *
 * Dynamic load, list playback, slew control, and per-channel selection
 * are real EL34243A capabilities that will widen the facade in a later
 * step; the personality stays narrow to mirror the current driver.
 */

const V_MAX = 150;
const I_MAX = 40;
const P_MAX = 300;

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("input:state", "0");
  s.set("function", "CURR");
  s.set("setpoint:curr", "0.000");
  s.set("setpoint:volt", "0.000");
  s.set("setpoint:res", "10.000");
  s.set("setpoint:pow", "0.000");
  for (const kind of ["OVP", "OCP", "OPP"]) {
    s.set(`prot:${kind}:state`, "0");
    s.set(`prot:${kind}:level`, kind === "OVP" ? String(V_MAX) : kind === "OCP" ? String(I_MAX) : String(P_MAX));
    s.set(`prot:${kind}:tripped`, "0");
  }
  return s;
}

function scalarGetSet(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function boolGetSet(key: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  };
}

const functionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("function") ?? "CURR") };
  }
  const raw = (cmd.args[0] ?? "CURR").toUpperCase();
  // Accept both full and short SCPI tokens.
  const tok = raw.startsWith("VOLT")
    ? "VOLT"
    : raw.startsWith("RES")
      ? "RES"
      : raw.startsWith("POW")
        ? "POW"
        : "CURR";
  ctx.state.set("function", tok);
  return { kind: "none" };
};

const measureHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const on = ctx.state.get("input:state") === "1";
  if (!on) return { kind: "line", text: "0.0" };
  const fn = String(ctx.state.get("function") ?? "CURR");
  // Report something round-trippable per mode. Voltage reflects the
  // external rail (synthetic 12 V), current mirrors the CC setpoint
  // when the load is sinking; power is derived.
  const voltage = 12.0;
  const currentSetpoint = Number(ctx.state.get("setpoint:curr") ?? 0);
  const current = fn === "CURR" ? currentSetpoint : 0.1;
  if (cmd.normalized.startsWith("MEASURE:VOLTAGE")) {
    return { kind: "line", text: voltage.toFixed(3) };
  }
  if (cmd.normalized.startsWith("MEASURE:CURRENT")) {
    return { kind: "line", text: current.toFixed(3) };
  }
  return { kind: "line", text: (voltage * current).toFixed(3) };
};

function setpointHandler(mode: "CURR" | "VOLT" | "RES" | "POW"): CommandHandler {
  const key = `setpoint:${mode.toLowerCase()}`;
  const fallback = "0.000";
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

const protectionHandler = (kind: "OVP" | "OCP" | "OPP"): CommandHandler => {
  return (cmd, ctx) => {
    const tail = cmd.normalized.replace(/^INPUT:PROTECTION:(OVP|OCP|OPP)/, "");
    if (tail.endsWith(":CLEAR")) {
      ctx.state.set(`prot:${kind}:tripped`, "0");
      return { kind: "none" };
    }
    if (tail.startsWith(":STATE")) {
      return boolGetSet(`prot:${kind}:state`)(cmd, ctx);
    }
    if (tail.startsWith(":TRIPPED")) {
      return { kind: "line", text: String(ctx.state.get(`prot:${kind}:tripped`) ?? "0") };
    }
    return scalarGetSet(
      `prot:${kind}:level`,
      kind === "OVP" ? String(V_MAX) : kind === "OCP" ? String(I_MAX) : String(P_MAX),
    )(cmd, ctx);
  };
};

const exactHandlers: Record<string, CommandHandler> = {
  "INPUT:STATE": boolGetSet("input:state"),
  "INPUT:STATE?": boolGetSet("input:state"),
  "SOURCE:FUNCTION": functionHandler,
  "SOURCE:FUNCTION?": functionHandler,
  "SOURCE:CURRENT:LEVEL:IMMEDIATE:AMPLITUDE": setpointHandler("CURR"),
  "SOURCE:CURRENT:LEVEL:IMMEDIATE:AMPLITUDE?": setpointHandler("CURR"),
  "SOURCE:VOLTAGE:LEVEL:IMMEDIATE:AMPLITUDE": setpointHandler("VOLT"),
  "SOURCE:VOLTAGE:LEVEL:IMMEDIATE:AMPLITUDE?": setpointHandler("VOLT"),
  "SOURCE:RESISTANCE:LEVEL:IMMEDIATE:AMPLITUDE": setpointHandler("RES"),
  "SOURCE:RESISTANCE:LEVEL:IMMEDIATE:AMPLITUDE?": setpointHandler("RES"),
  "SOURCE:POWER:LEVEL:IMMEDIATE:AMPLITUDE": setpointHandler("POW"),
  "SOURCE:POWER:LEVEL:IMMEDIATE:AMPLITUDE?": setpointHandler("POW"),
  "MEASURE:VOLTAGE?": measureHandler,
  "MEASURE:CURRENT?": measureHandler,
  "MEASURE:POWER?": measureHandler,
  "INPUT:PROTECTION:OVP:STATE": protectionHandler("OVP"),
  "INPUT:PROTECTION:OVP:STATE?": protectionHandler("OVP"),
  "INPUT:PROTECTION:OVP:LEVEL": protectionHandler("OVP"),
  "INPUT:PROTECTION:OVP:LEVEL?": protectionHandler("OVP"),
  "INPUT:PROTECTION:OVP:TRIPPED?": protectionHandler("OVP"),
  "INPUT:PROTECTION:OVP:CLEAR": protectionHandler("OVP"),
  "INPUT:PROTECTION:OCP:STATE": protectionHandler("OCP"),
  "INPUT:PROTECTION:OCP:STATE?": protectionHandler("OCP"),
  "INPUT:PROTECTION:OCP:LEVEL": protectionHandler("OCP"),
  "INPUT:PROTECTION:OCP:LEVEL?": protectionHandler("OCP"),
  "INPUT:PROTECTION:OCP:TRIPPED?": protectionHandler("OCP"),
  "INPUT:PROTECTION:OCP:CLEAR": protectionHandler("OCP"),
  "INPUT:PROTECTION:OPP:STATE": protectionHandler("OPP"),
  "INPUT:PROTECTION:OPP:STATE?": protectionHandler("OPP"),
  "INPUT:PROTECTION:OPP:LEVEL": protectionHandler("OPP"),
  "INPUT:PROTECTION:OPP:LEVEL?": protectionHandler("OPP"),
  "INPUT:PROTECTION:OPP:TRIPPED?": protectionHandler("OPP"),
  "INPUT:PROTECTION:OPP:CLEAR": protectionHandler("OPP"),
};

export const keysightEl34243aPersonality: SimulatorPersonality = {
  id: "keysight-el34243a",
  kind: "electronicLoad",
  idn: "Keysight Technologies,EL34243A,{serial},1.0.0-1.05",
  opt: "",
  fixture,
  exactHandlers,
  initialState: defaultState,
};
