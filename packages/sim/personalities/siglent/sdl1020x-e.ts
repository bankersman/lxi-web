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
  readFileSync(resolve(here, "sdl1020x-e.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Siglent SDL1020X-E personality — round-trip electronic-load sim
 * that matches the `SiglentSdl` driver's `:SOURce` / `:MEASure`
 * tree. A 12 V synthetic DUT sources up to the set current, and
 * protection settings land in state so setter/getter pairs stay
 * consistent without tripping anything.
 */
function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("input", "OFF");
  s.set("function", "CURR");
  s.set("level:cc", "1.000000");
  s.set("level:cv", "5.000000");
  s.set("level:cr", "100.000000");
  s.set("level:cp", "10.000000");
  s.set("ovp:state", "OFF");
  s.set("ovp:level", "150.000000");
  s.set("ovp:trip", "0");
  s.set("ocp:state", "OFF");
  s.set("ocp:level", "40.000000");
  s.set("ocp:trip", "0");
  s.set("opp:state", "OFF");
  s.set("opp:level", "200.000000");
  s.set("opp:trip", "0");
  return s;
}

function setOrGet(key: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
    }
    const raw = cmd.args[0] ?? "";
    ctx.state.set(key, raw.toUpperCase());
    return { kind: "none" };
  };
}

function measure(kind: "voltage" | "current" | "power" | "resistance"): CommandHandler {
  return (_, ctx): CommandResult => {
    const on = String(ctx.state.get("input") ?? "OFF").toUpperCase() === "ON" ||
      ctx.state.get("input") === "1";
    if (!on) return { kind: "line", text: "0.000000" };
    const fn = String(ctx.state.get("function") ?? "CURR").toUpperCase();
    const ccI = Number.parseFloat(String(ctx.state.get("level:cc") ?? "0"));
    const cvV = Number.parseFloat(String(ctx.state.get("level:cv") ?? "0"));
    const crR = Number.parseFloat(String(ctx.state.get("level:cr") ?? "1"));
    const cpP = Number.parseFloat(String(ctx.state.get("level:cp") ?? "0"));
    const vSource = 12;
    let v = vSource;
    let i = 0;
    if (fn.startsWith("CURR")) {
      i = ccI;
    } else if (fn.startsWith("VOLT")) {
      v = Math.min(vSource, cvV);
      i = v / Math.max(crR, 1);
    } else if (fn.startsWith("RES")) {
      i = vSource / Math.max(crR, 0.01);
    } else if (fn.startsWith("POW")) {
      i = cpP / Math.max(vSource, 0.01);
    }
    const value =
      kind === "voltage" ? v : kind === "current" ? i : kind === "power" ? v * i : i > 0 ? v / i : 9999999;
    return { kind: "line", text: value.toFixed(6) };
  };
}

export const siglentSdl1020xEPersonality: SimulatorPersonality = {
  id: "siglent-sdl1020x-e",
  kind: "electronicLoad",
  idn: "Siglent Technologies,SDL1020X-E,{serial},1.1.1.25",
  opt: "",
  fixture,
  initialState: defaultState,
  exactHandlers: {
    "SOURCE:INPUT:STATE": setOrGet("input"),
    "SOURCE:INPUT:STATE?": setOrGet("input"),
    "SOURCE:FUNCTION": setOrGet("function"),
    "SOURCE:FUNCTION?": setOrGet("function"),
    "SOURCE:CURRENT:LEVEL:IMMEDIATE": setOrGet("level:cc"),
    "SOURCE:CURRENT:LEVEL:IMMEDIATE?": setOrGet("level:cc"),
    "SOURCE:VOLTAGE:LEVEL:IMMEDIATE": setOrGet("level:cv"),
    "SOURCE:VOLTAGE:LEVEL:IMMEDIATE?": setOrGet("level:cv"),
    "SOURCE:RESISTANCE:LEVEL:IMMEDIATE": setOrGet("level:cr"),
    "SOURCE:RESISTANCE:LEVEL:IMMEDIATE?": setOrGet("level:cr"),
    "SOURCE:POWER:LEVEL:IMMEDIATE": setOrGet("level:cp"),
    "SOURCE:POWER:LEVEL:IMMEDIATE?": setOrGet("level:cp"),
    "MEASURE:VOLTAGE?": measure("voltage"),
    "MEASURE:CURRENT?": measure("current"),
    "MEASURE:POWER?": measure("power"),
    "MEASURE:RESISTANCE?": measure("resistance"),
    "SOURCE:VOLTAGE:PROTECTION:STATE": setOrGet("ovp:state"),
    "SOURCE:VOLTAGE:PROTECTION:STATE?": setOrGet("ovp:state"),
    "SOURCE:VOLTAGE:PROTECTION:LEVEL": setOrGet("ovp:level"),
    "SOURCE:VOLTAGE:PROTECTION:LEVEL?": setOrGet("ovp:level"),
    "SOURCE:VOLTAGE:PROTECTION:TRIP?": setOrGet("ovp:trip"),
    "SOURCE:VOLTAGE:PROTECTION:CLEAR": (_, ctx): CommandResult => {
      ctx.state.set("ovp:trip", "0");
      return { kind: "none" };
    },
    "SOURCE:CURRENT:PROTECTION:STATE": setOrGet("ocp:state"),
    "SOURCE:CURRENT:PROTECTION:STATE?": setOrGet("ocp:state"),
    "SOURCE:CURRENT:PROTECTION:LEVEL": setOrGet("ocp:level"),
    "SOURCE:CURRENT:PROTECTION:LEVEL?": setOrGet("ocp:level"),
    "SOURCE:CURRENT:PROTECTION:TRIP?": setOrGet("ocp:trip"),
    "SOURCE:CURRENT:PROTECTION:CLEAR": (_, ctx): CommandResult => {
      ctx.state.set("ocp:trip", "0");
      return { kind: "none" };
    },
    "SOURCE:POWER:PROTECTION:STATE": setOrGet("opp:state"),
    "SOURCE:POWER:PROTECTION:STATE?": setOrGet("opp:state"),
    "SOURCE:POWER:PROTECTION:LEVEL": setOrGet("opp:level"),
    "SOURCE:POWER:PROTECTION:LEVEL?": setOrGet("opp:level"),
    "SOURCE:POWER:PROTECTION:TRIP?": setOrGet("opp:trip"),
    "SOURCE:POWER:PROTECTION:CLEAR": (_, ctx): CommandResult => {
      ctx.state.set("opp:trip", "0");
      return { kind: "none" };
    },
  },
};
