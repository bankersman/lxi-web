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
  readFileSync(resolve(here, "dl3021.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Rigol DL3021 electronic-load personality. Implements the `:SOURce:*`,
 * `:MEASure:*`, protection, dynamic and battery trees the DL3000 driver
 * talks to, plus enough statefulness that setter / getter round-trips
 * are consistent. Measurements are synthesised from the active mode's
 * setpoint so the dashboard renders a believable reading.
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
  s.set("ovp:tripped", "0");
  s.set("ocp:state", "OFF");
  s.set("ocp:level", "40.000000");
  s.set("ocp:tripped", "0");
  s.set("opp:state", "OFF");
  s.set("opp:level", "200.000000");
  s.set("opp:tripped", "0");

  s.set("trans:mode", "CURR");
  s.set("trans:enabled", "OFF");
  s.set("trans:alev", "1.0");
  s.set("trans:blev", "2.0");
  s.set("trans:awid", "0.001");
  s.set("trans:bwid", "0.001");
  s.set("trans:srate", "0.5");

  s.set("batt:state", "OFF");
  s.set("batt:func", "CURR");
  s.set("batt:level", "1.0");
  s.set("batt:voltage", "2.5");
  s.set("batt:capability", "0");
  s.set("batt:timer", "0");
  s.set("batt:time", "0");
  s.set("batt:acc:cap", "0");
  s.set("batt:acc:energy", "0");
  s.set("batt:stop", "NONE");
  return s;
}

function setOrGet(
  key: string,
  onSet?: (value: string, ctx: { state: Map<string, unknown> }) => void,
): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      const v = (ctx.state.get(key) as string | undefined) ?? "0";
      return { kind: "line", text: v };
    }
    const raw = cmd.args[0] ?? "";
    ctx.state.set(key, raw.toUpperCase());
    onSet?.(raw, ctx);
    return { kind: "none" };
  };
}

function measureValue(
  kind: "voltage" | "current" | "power" | "resistance",
): CommandHandler {
  return (_, ctx): CommandResult => {
    const input = ctx.state.get("input");
    const on = input === "ON" || input === "1";
    if (!on) {
      return { kind: "line", text: (kind === "voltage" ? 0 : 0).toFixed(6) };
    }
    const fn = String(ctx.state.get("function") ?? "CURR").toUpperCase();
    const ccI = Number.parseFloat(String(ctx.state.get("level:cc") ?? "0"));
    const cvV = Number.parseFloat(String(ctx.state.get("level:cv") ?? "0"));
    const crR = Number.parseFloat(String(ctx.state.get("level:cr") ?? "1"));
    const cpP = Number.parseFloat(String(ctx.state.get("level:cp") ?? "0"));

    // Pretend the DUT is a 12V source.
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
    const p = v * i;
    const r = i > 0 ? v / i : 999_999;
    const value =
      kind === "voltage"
        ? v
        : kind === "current"
          ? i
          : kind === "power"
            ? p
            : r;
    return { kind: "line", text: value.toFixed(6) };
  };
}

export const rigolDl3021Personality: SimulatorPersonality = {
  id: "rigol-dl3021",
  kind: "electronicLoad",
  idn: "RIGOL TECHNOLOGIES,DL3021,{serial},00.01.05",
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

    "MEASURE:VOLTAGE?": measureValue("voltage"),
    "MEASURE:CURRENT?": measureValue("current"),
    "MEASURE:POWER?": measureValue("power"),
    "MEASURE:RESISTANCE?": measureValue("resistance"),

    "SOURCE:VOLTAGE:PROTECTION:STATE": setOrGet("ovp:state"),
    "SOURCE:VOLTAGE:PROTECTION:STATE?": setOrGet("ovp:state"),
    "SOURCE:VOLTAGE:PROTECTION:LEVEL": setOrGet("ovp:level"),
    "SOURCE:VOLTAGE:PROTECTION:LEVEL?": setOrGet("ovp:level"),
    "SOURCE:VOLTAGE:PROTECTION:TRIPPED?": setOrGet("ovp:tripped"),
    "SOURCE:VOLTAGE:PROTECTION:CLEAR": (_, ctx): CommandResult => {
      ctx.state.set("ovp:tripped", "0");
      return { kind: "none" };
    },
    "SOURCE:CURRENT:PROTECTION:STATE": setOrGet("ocp:state"),
    "SOURCE:CURRENT:PROTECTION:STATE?": setOrGet("ocp:state"),
    "SOURCE:CURRENT:PROTECTION:LEVEL": setOrGet("ocp:level"),
    "SOURCE:CURRENT:PROTECTION:LEVEL?": setOrGet("ocp:level"),
    "SOURCE:CURRENT:PROTECTION:TRIPPED?": setOrGet("ocp:tripped"),
    "SOURCE:CURRENT:PROTECTION:CLEAR": (_, ctx): CommandResult => {
      ctx.state.set("ocp:tripped", "0");
      return { kind: "none" };
    },
    "SOURCE:POWER:PROTECTION:STATE": setOrGet("opp:state"),
    "SOURCE:POWER:PROTECTION:STATE?": setOrGet("opp:state"),
    "SOURCE:POWER:PROTECTION:LEVEL": setOrGet("opp:level"),
    "SOURCE:POWER:PROTECTION:LEVEL?": setOrGet("opp:level"),
    "SOURCE:POWER:PROTECTION:TRIPPED?": setOrGet("opp:tripped"),
    "SOURCE:POWER:PROTECTION:CLEAR": (_, ctx): CommandResult => {
      ctx.state.set("opp:tripped", "0");
      return { kind: "none" };
    },

    "SOURCE:FUNCTION:TRANSIENT": setOrGet("trans:mode"),
    "SOURCE:FUNCTION:TRANSIENT?": setOrGet("trans:mode"),
    "SOURCE:INPUT:TRANSIENT": setOrGet("trans:enabled"),
    "SOURCE:INPUT:TRANSIENT?": setOrGet("trans:enabled"),

    "SOURCE:BATTERY:STATE": setOrGet("batt:state"),
    "SOURCE:BATTERY:STATE?": setOrGet("batt:state"),
    "SOURCE:BATTERY:FUNCTION": setOrGet("batt:func"),
    "SOURCE:BATTERY:FUNCTION?": setOrGet("batt:func"),
    "SOURCE:BATTERY:LEVEL": setOrGet("batt:level"),
    "SOURCE:BATTERY:LEVEL?": setOrGet("batt:level"),
    "SOURCE:BATTERY:VOLTAGE": setOrGet("batt:voltage"),
    "SOURCE:BATTERY:VOLTAGE?": setOrGet("batt:voltage"),
    "SOURCE:BATTERY:CAPABILITY": setOrGet("batt:capability"),
    "SOURCE:BATTERY:CAPABILITY?": setOrGet("batt:capability"),
    "SOURCE:BATTERY:TIMER": setOrGet("batt:timer"),
    "SOURCE:BATTERY:TIMER?": setOrGet("batt:timer"),
    "SOURCE:BATTERY:TIME?": setOrGet("batt:time"),
    "SOURCE:BATTERY:DISCHAR:CAPABILITY?": setOrGet("batt:acc:cap"),
    "SOURCE:BATTERY:DISCHAR:ENERGY?": setOrGet("batt:acc:energy"),
    "SOURCE:BATTERY:STOP?": setOrGet("batt:stop"),

    "SYSTEM:OTP?": (): CommandResult => ({ kind: "line", text: "0" }),
  },
  prefixHandlers: [
    {
      // `:SOURce:CURRent:TRANsient:ALEVel` etc. — echo/store via a single
      // key so the driver can read back whatever it wrote. The DL3000
      // scopes transient settings per primary mode; we collapse them onto
      // one key because the simulator only needs round-trip consistency.
      pattern: /^SOURCE:(?:CURRENT|VOLTAGE|RESISTANCE|POWER):TRANSIENT:(ALEVEL|BLEVEL|AWIDTH|BWIDTH|SRATE)/,
      handler: (cmd, ctx): CommandResult => {
        const match =
          /SOURCE:(?:CURRENT|VOLTAGE|RESISTANCE|POWER):TRANSIENT:(ALEVEL|BLEVEL|AWIDTH|BWIDTH|SRATE)/.exec(
            cmd.normalized,
          );
        const field = match?.[1] ?? "";
        const key =
          field === "ALEVEL"
            ? "trans:alev"
            : field === "BLEVEL"
              ? "trans:blev"
              : field === "AWIDTH"
                ? "trans:awid"
                : field === "BWIDTH"
                  ? "trans:bwid"
                  : "trans:srate";
        if (cmd.isQuery) {
          return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
        }
        const arg = cmd.args[0] ?? "0";
        ctx.state.set(key, arg);
        return { kind: "none" };
      },
    },
  ],
};
