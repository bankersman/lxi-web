import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";
import { encodeIeee488Block } from "../../src/handlers/ieee488-block.js";

/**
 * Rohde & Schwarz RTB2004 — 4-channel / 300 MHz entry benchscope.
 *
 * The RTB SCPI tree is a clean IVI-4.1 dialect — channels sit under
 * `CHANnel<n>:*`, the timebase under `TIMebase:*`, and triggering
 * under `TRIGger:A:*`. Waveform download goes through
 * `CHANnel<n>:DATA:HEADer?` → `CHANnel<n>:DATA?` with the driver
 * decoding a 16-bit big-endian IEEE 488.2 block of samples.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 4; ch++) {
    s.set(`ch${ch}:enabled`, ch === 1 ? "1" : "0");
    s.set(`ch${ch}:scale`, "1.0000E+00");
    s.set(`ch${ch}:offset`, "0");
    s.set(`ch${ch}:coupling`, "DCLimit");
  }
  s.set("timebase:scale", "1.0000E-06");
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

const SAMPLES = 512;
const X_START = -2.56e-7;
const X_STOP = 2.56e-7;

const dataHeaderHandler: CommandHandler = (): CommandResult => ({
  kind: "line",
  text: `${X_START},${X_STOP},${SAMPLES},1`,
});

const dataHandler: CommandHandler = (): CommandResult => {
  const bytes = new Uint8Array(SAMPLES * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < SAMPLES; i += 1) {
    const phase = (i / SAMPLES) * Math.PI * 4;
    const sample = Math.round(Math.sin(phase) * 20_000);
    view.setInt16(i * 2, sample, false);
  }
  return { kind: "binary", bytes: encodeIeee488Block(bytes) };
};

const exactHandlers: Record<string, CommandHandler> = {
  RUN: (): CommandResult => ({ kind: "none" }),
  STOP: (): CommandResult => ({ kind: "none" }),
  SINGLE: (): CommandResult => ({ kind: "none" }),
  AUTOSCALE: (): CommandResult => ({ kind: "none" }),
  "TRIGGER:A:FORCE": (): CommandResult => ({ kind: "none" }),
  "TIMEBASE:SCALE": scalarHandler("timebase:scale", "1.0000E-06"),
  "TIMEBASE:SCALE?": scalarHandler("timebase:scale", "1.0000E-06"),
  "TIMEBASE:POSITION": scalarHandler("timebase:position", "0"),
  "TIMEBASE:POSITION?": scalarHandler("timebase:position", "0"),
  "TRIGGER:A:MODE": scalarHandler("trig:mode", "AUTO"),
  "TRIGGER:A:MODE?": scalarHandler("trig:mode", "AUTO"),
  "TRIGGER:A:SOURCE": scalarHandler("trig:source", "CH1"),
  "TRIGGER:A:SOURCE?": scalarHandler("trig:source", "CH1"),
  "TRIGGER:A:EDGE:SLOPE": scalarHandler("trig:edge:slope", "POSitive"),
  "TRIGGER:A:EDGE:SLOPE?": scalarHandler("trig:edge:slope", "POSitive"),
  "TRIGGER:A:LEVEL1": scalarHandler("trig:level", "0"),
  "TRIGGER:A:LEVEL1?": scalarHandler("trig:level", "0"),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  channelScalar(/^CHANNEL([1-8]):STATE\??$/, "enabled", "0"),
  channelScalar(/^CHANNEL([1-8]):SCALE\??$/, "scale", "1.0000E+00"),
  channelScalar(/^CHANNEL([1-8]):OFFSET\??$/, "offset", "0"),
  channelScalar(/^CHANNEL([1-8]):COUPLING\??$/, "coupling", "DCLimit"),
  { pattern: /^CHANNEL[1-8]:DATA:HEADER\?$/, handler: dataHeaderHandler },
  { pattern: /^CHANNEL[1-8]:DATA\?$/, handler: dataHandler },
];

export const rndsRtb2004Personality: SimulatorPersonality = {
  id: "rnds-rtb2004",
  kind: "oscilloscope",
  idn: "Rohde&Schwarz,RTB2004,{serial},FV:02.400",
  opt: "B1,K1,K2,K3",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
