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
  readFileSync(resolve(here, "dm858.fixture.json"), "utf8"),
) as PersonalityFixture;

function rollingReading(state: Map<string, unknown>, key: string, base: number, spread: number): number {
  const counter = ((state.get(key) as number | undefined) ?? 0) + 1;
  state.set(key, counter);
  return base + Math.sin(counter / 5) * spread;
}

const readValue: CommandHandler = (_, ctx): CommandResult => {
  const v = rollingReading(ctx.state, "primaryReadCount", 1.2345, 0.02);
  return { kind: "line", text: v.toFixed(6) };
};

/**
 * Rigol DM858 personality. Minimal reading loop + mode echoes so the DMM
 * dashboard renders a live primary reading and a configuration form.
 */
export const rigolDm858Personality: SimulatorPersonality = {
  id: "rigol-dm858",
  kind: "multimeter",
  idn: "RIGOL TECHNOLOGIES,DM858,{serial},00.01.05",
  opt: "",
  fixture,
  exactHandlers: {
    "READ?": readValue,
    "FETCH?": readValue,
    "MEASURE:VOLTAGE:DC?": readValue,
    "MEASURE:VOLTAGE:AC?": readValue,
    "MEASURE:CURRENT:DC?": readValue,
    "MEASURE:CURRENT:AC?": readValue,
    "MEASURE:RESISTANCE?": (): CommandResult => ({ kind: "line", text: "1.234000E+03" }),
    "MEASURE:FRESISTANCE?": (): CommandResult => ({
      kind: "line",
      text: "1.234000E+03",
    }),
    "MEASURE:FREQUENCY?": (): CommandResult => ({ kind: "line", text: "1.000000E+03" }),
    "MEASURE:TEMPERATURE?": (): CommandResult => ({ kind: "line", text: "2.535000E+01" }),
    "CALCULATE:AVERAGE:AVERAGE?": (): CommandResult => ({
      kind: "line",
      text: "1.2345",
    }),
    "CALCULATE:AVERAGE:MAXIMUM?": (): CommandResult => ({ kind: "line", text: "1.26" }),
    "CALCULATE:AVERAGE:MINIMUM?": (): CommandResult => ({ kind: "line", text: "1.21" }),
    "CALCULATE:AVERAGE:SDEV?": (): CommandResult => ({ kind: "line", text: "0.0123" }),
    "CALCULATE:AVERAGE:COUNT?": (): CommandResult => ({ kind: "line", text: "50" }),
    "INIT:IMMEDIATE": (): CommandResult => ({ kind: "none" }),
    INIT: (): CommandResult => ({ kind: "none" }),
    ABORT: (): CommandResult => ({ kind: "none" }),
    "DATA:REMOVE? 1": (): CommandResult => ({ kind: "line", text: "1.2345" }),
  },
  prefixHandlers: [
    {
      pattern: /^CONFIGURE:/,
      handler: (): CommandResult => ({ kind: "none" }),
    },
    {
      pattern: /^SENSE:/,
      handler: (cmd, ctx): CommandResult => {
        if (cmd.isQuery) {
          const fixtureHit = ctx.fixture.responses?.[cmd.normalized];
          if (typeof fixtureHit === "string") return { kind: "line", text: fixtureHit };
          return { kind: "line", text: "0" };
        }
        return { kind: "none" };
      },
    },
  ],
};
