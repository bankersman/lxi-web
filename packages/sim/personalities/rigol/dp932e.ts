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
  readFileSync(resolve(here, "dp932e.fixture.json"), "utf8"),
) as PersonalityFixture & { readonly channelCount: number };

function defaultChannelState(): Map<string, unknown> {
  const state = new Map<string, unknown>();
  for (let ch = 1; ch <= 3; ch++) {
    state.set(`source${ch}:voltage`, "0.000000E+00");
    state.set(`source${ch}:current`, "0.100000E+00");
    state.set(`output${ch}:state`, "OFF");
    state.set(`output${ch}:ovp:state`, "OFF");
    state.set(`output${ch}:ovp:level`, "3.300000E+01");
    state.set(`output${ch}:ocp:state`, "OFF");
    state.set(`output${ch}:ocp:level`, "3.200000E+00");
    state.set(`output${ch}:ovp:tripped`, "0");
    state.set(`output${ch}:ocp:tripped`, "0");
  }
  return state;
}

function settablePerChannel(
  pattern: RegExp,
  stateKey: (channel: string) => string,
): { pattern: RegExp; handler: CommandHandler } {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = stateKey(channel);
      if (cmd.isQuery) {
        const v = (ctx.state.get(key) as string | undefined) ?? "0";
        return { kind: "line", text: v };
      }
      const arg = cmd.args[0];
      if (arg !== undefined) ctx.state.set(key, arg.toUpperCase());
      return { kind: "none" };
    },
  };
}

/**
 * Rigol DP932E personality. Implements read-back of setpoints + outputs
 * and canned `MEAS:*` readings so the PSU dashboard cards render.
 */
export const rigolDp932ePersonality: SimulatorPersonality = {
  id: "rigol-dp932e",
  kind: "powerSupply",
  idn: "RIGOL TECHNOLOGIES,DP932E,{serial},00.01.02",
  opt: "",
  fixture,
  initialState: defaultChannelState,
  prefixHandlers: [
    settablePerChannel(
      /^(?:SOUR(?:CE)?)?([1-3])?:?VOLTAGE\??$/,
      (c) => `source${c}:voltage`,
    ),
    settablePerChannel(
      /^(?:SOUR(?:CE)?)?([1-3])?:?CURRENT\??$/,
      (c) => `source${c}:current`,
    ),
    settablePerChannel(/^OUTPUT([1-3]):?STATE\??$/, (c) => `output${c}:state`),
    settablePerChannel(/^OUTPUT:STATE\s*CH([1-3])/, (c) => `output${c}:state`),
    {
      pattern: /^OUTPUT\s+CH([1-3])/,
      handler: (cmd, ctx): CommandResult => {
        const match = /^OUTPUT\s+CH([1-3])\s*,\s*(ON|OFF)/.exec(cmd.raw.toUpperCase());
        if (match) {
          const [, ch, value] = match;
          ctx.state.set(`output${ch}:state`, value);
        }
        return { kind: "none" };
      },
    },
    {
      pattern: /^OUTPUT\?\s*CH([1-3])/,
      handler: (cmd, ctx): CommandResult => {
        const match = /CH([1-3])/.exec(cmd.raw.toUpperCase());
        const ch = match?.[1] ?? "1";
        const v = (ctx.state.get(`output${ch}:state`) as string | undefined) ?? "OFF";
        return { kind: "line", text: v };
      },
    },
    settablePerChannel(/^OUTPUT([1-3]):OVP:STATE\??$/, (c) => `output${c}:ovp:state`),
    settablePerChannel(/^OUTPUT([1-3]):OVP(?::LEVEL)?\??$/, (c) => `output${c}:ovp:level`),
    settablePerChannel(/^OUTPUT([1-3]):OCP:STATE\??$/, (c) => `output${c}:ocp:state`),
    settablePerChannel(/^OUTPUT([1-3]):OCP(?::LEVEL)?\??$/, (c) => `output${c}:ocp:level`),
    settablePerChannel(/^OUTPUT([1-3]):OVP:TRIPPED\??$/, (c) => `output${c}:ovp:tripped`),
    settablePerChannel(/^OUTPUT([1-3]):OCP:TRIPPED\??$/, (c) => `output${c}:ocp:tripped`),
    {
      pattern: /^(?:MEAS(?:URE)?:?)(VOLTAGE|CURRENT|POWER)\?/,
      handler: (cmd, ctx): CommandResult => {
        if (!cmd.isQuery) return { kind: "none" };
        const channelArg = cmd.args[0] ?? cmd.raw.match(/CH([1-3])/i)?.[0] ?? "CH1";
        const match = /CH([1-3])/i.exec(channelArg) ?? /^[1-3]$/.exec(channelArg);
        const ch = match ? (match[1] ?? match[0]) : "1";
        const kind = cmd.normalized.includes("VOLTAGE")
          ? "voltage"
          : cmd.normalized.includes("CURRENT")
            ? "current"
            : "power";
        const setpointV = Number.parseFloat(
          (ctx.state.get(`source${ch}:voltage`) as string) ?? "0",
        );
        const setpointI = Number.parseFloat(
          (ctx.state.get(`source${ch}:current`) as string) ?? "0",
        );
        const output = ctx.state.get(`output${ch}:state`);
        const enabled = output === "ON" || output === "1";
        if (kind === "voltage") {
          return { kind: "line", text: (enabled ? setpointV : 0).toFixed(6) };
        }
        if (kind === "current") {
          return { kind: "line", text: (enabled ? Math.min(setpointI, 0.001) : 0).toFixed(6) };
        }
        return {
          kind: "line",
          text: (enabled ? setpointV * Math.min(setpointI, 0.001) : 0).toFixed(6),
        };
      },
    },
  ],
};
