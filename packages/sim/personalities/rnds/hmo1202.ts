import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";
import { encodeIeee488Block } from "../../src/handlers/ieee488-block.js";

/**
 * Rohde & Schwarz HMO1202 — Hameg-heritage 2-channel / 100 MHz scope.
 *
 * The scope still identifies itself as `HAMEG,HMO1202,…` on the wire,
 * which exercises the R&S manufacturer regex (`rohde\s*&\s*schwarz|r&s|hameg/i`).
 * SCPI shape matches the RTB driver (`CHANnel<n>:*`, `TIMebase:*`,
 * `TRIGger:A:*`) but samples come back 8-bit on legacy firmware.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 2; ch++) {
    s.set(`ch${ch}:enabled`, ch === 1 ? "1" : "0");
    s.set(`ch${ch}:scale`, "5.0000E-01");
    s.set(`ch${ch}:offset`, "0");
    s.set(`ch${ch}:coupling`, "DC");
  }
  s.set("timebase:scale", "1.0000E-05");
  s.set("timebase:position", "0");
  s.set("trig:mode", "AUTO");
  s.set("trig:source", "CH1");
  s.set("trig:edge:slope", "POSitive");
  s.set("trig:level", "0");
  return s;
}

function scalarHandler(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function channelScalar(
  pattern: RegExp,
  property: string,
  fallback: string,
): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `ch${channel}:${property}`;
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
      }
      const arg = cmd.args[0];
      if (arg !== undefined) ctx.state.set(key, arg);
      return { kind: "none" };
    },
  };
}

const SAMPLES = 256;

const dataHeaderHandler: CommandHandler = (): CommandResult => ({
  kind: "line",
  text: `-1.28e-5,1.28e-5,${SAMPLES},1`,
});

const dataHandler: CommandHandler = (): CommandResult => {
  const bytes = new Uint8Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i += 1) {
    const phase = (i / SAMPLES) * Math.PI * 4;
    const signed = Math.round(Math.sin(phase) * 100);
    bytes[i] = (signed & 0xff);
  }
  return { kind: "binary", bytes: encodeIeee488Block(bytes) };
};

const exactHandlers: Record<string, CommandHandler> = {
  RUN: (): CommandResult => ({ kind: "none" }),
  STOP: (): CommandResult => ({ kind: "none" }),
  SINGLE: (): CommandResult => ({ kind: "none" }),
  AUTOSCALE: (): CommandResult => ({ kind: "none" }),
  "TIMEBASE:SCALE?": scalarHandler("timebase:scale", "1.0000E-05"),
  "TIMEBASE:POSITION?": scalarHandler("timebase:position", "0"),
  "TRIGGER:A:MODE?": scalarHandler("trig:mode", "AUTO"),
  "TRIGGER:A:SOURCE?": scalarHandler("trig:source", "CH1"),
  "TRIGGER:A:EDGE:SLOPE?": scalarHandler("trig:edge:slope", "POSitive"),
  "TRIGGER:A:LEVEL1?": scalarHandler("trig:level", "0"),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  channelScalar(/^CHANNEL([12]):STATE\??$/, "enabled", "0"),
  channelScalar(/^CHANNEL([12]):SCALE\??$/, "scale", "5.0000E-01"),
  channelScalar(/^CHANNEL([12]):OFFSET\??$/, "offset", "0"),
  channelScalar(/^CHANNEL([12]):COUPLING\??$/, "coupling", "DC"),
  { pattern: /^CHANNEL[12]:DATA:HEADER\?$/, handler: dataHeaderHandler },
  { pattern: /^CHANNEL[12]:DATA\?$/, handler: dataHandler },
];

export const rndsHmo1202Personality: SimulatorPersonality = {
  id: "rnds-hmo1202",
  kind: "oscilloscope",
  idn: "HAMEG,HMO1202,{serial},05.614",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
