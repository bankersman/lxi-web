import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  SimulatorPersonality,
} from "../../src/personality.js";
import { encodeIeee488Block } from "../../src/handlers/ieee488-block.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "dho804.fixture.json"), "utf8"),
) as PersonalityFixture & {
  readonly waveformAmplitude: number;
  readonly waveformPoints: number;
};

/** Default per-channel values when a session starts. */
function initialChannelState(): Map<string, unknown> {
  const state = new Map<string, unknown>();
  for (let ch = 1; ch <= 4; ch++) {
    state.set(`chan${ch}:display`, ch === 1 ? "1" : "0");
    state.set(`chan${ch}:scale`, "1.000000E+00");
    state.set(`chan${ch}:offset`, "0.000000E+00");
    state.set(`chan${ch}:coupling`, "DC");
    state.set(`chan${ch}:probe`, "1.000000E+01");
    state.set(`chan${ch}:bwlimit`, "OFF");
    state.set(`chan${ch}:invert`, "0");
    state.set(`chan${ch}:unit`, "VOLT");
  }
  return state;
}

function scalarChannelHandler(
  pattern: RegExp,
  property: string,
): { pattern: RegExp; handler: CommandHandler } {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `chan${channel}:${property}`;
      if (cmd.isQuery) {
        const value = (ctx.state.get(key) as string | undefined) ?? "0";
        return { kind: "line", text: value };
      }
      const arg = cmd.args[0];
      if (arg !== undefined) ctx.state.set(key, arg.toUpperCase());
      return { kind: "none" };
    },
  };
}

export const rigolDho804Personality: SimulatorPersonality = {
  id: "rigol-dho804",
  kind: "oscilloscope",
  idn: "RIGOL TECHNOLOGIES,DHO804,{serial},00.02.01",
  opt: "AFG,BW7T1,MSO,SD-I2C,SD-SPI,SD-UART,SD-CAN,SD-LIN",
  fixture,
  initialState: initialChannelState,
  exactHandlers: {
    ":RUN": (): CommandResult => ({ kind: "none" }),
    RUN: (): CommandResult => ({ kind: "none" }),
    ":STOP": (): CommandResult => ({ kind: "none" }),
    STOP: (): CommandResult => ({ kind: "none" }),
    ":SINGLE": (): CommandResult => ({ kind: "none" }),
    SINGLE: (): CommandResult => ({ kind: "none" }),
    ":AUTOSET": (): CommandResult => ({ kind: "none" }),
    AUTOSET: (): CommandResult => ({ kind: "none" }),
    ":TFORCE": (): CommandResult => ({ kind: "none" }),
    TFORCE: (): CommandResult => ({ kind: "none" }),
    "WAVEFORM:DATA?": (_, ctx): CommandResult => {
      const points = (ctx.fixture.waveformPoints as number | undefined) ?? 1200;
      const amp = (ctx.fixture.waveformAmplitude as number | undefined) ?? 80;
      const bytes = new Uint8Array(points);
      for (let i = 0; i < points; i++) {
        const phase = (i / points) * Math.PI * 4;
        bytes[i] = Math.max(0, Math.min(255, 128 + Math.round(Math.sin(phase) * amp)));
      }
      return { kind: "binary", bytes: encodeIeee488Block(bytes) };
    },
    "DISPLAY:DATA?": (): CommandResult => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return { kind: "binary", bytes: encodeIeee488Block(png) };
    },
  },
  prefixHandlers: [
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):DISPLAY\??$/, "display"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):SCALE\??$/, "scale"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):OFFSET\??$/, "offset"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):COUPLING\??$/, "coupling"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):PROBE\??$/, "probe"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):BWLIMIT\??$/, "bwlimit"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):INVERT\??$/, "invert"),
    scalarChannelHandler(/^CHAN(?:NEL)?([1-4]):UNITS?\??$/, "unit"),
    {
      pattern: /^MEASURE:ITEM\?/,
      handler: (cmd): CommandResult => {
        if (!cmd.isQuery) return { kind: "none" };
        const item = cmd.args[0]?.toUpperCase() ?? "";
        const canned: Record<string, string> = {
          VMAX: "3.300000E+00",
          VMIN: "-3.300000E+00",
          VPP: "6.600000E+00",
          VAVG: "0.000000E+00",
          VRMS: "2.333000E+00",
          FREQUENCY: "1.000000E+03",
          PERIOD: "1.000000E-03",
          RTIME: "5.000000E-08",
          FTIME: "5.000000E-08",
        };
        return { kind: "line", text: canned[item] ?? "0.000000E+00" };
      },
    },
  ],
};
