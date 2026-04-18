import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";
import { encodeIeee488Block } from "../../src/handlers/ieee488-block.js";

/**
 * Tektronix MSO54 — 4-channel / 1 GHz / 12-bit 5 Series MSO.
 *
 * SCPI surface exercises the **binary `WFMOutpre?` waveform path**. The
 * simulator serves a 16-bit big-endian IEEE 488.2 block per `CURVe?`
 * query; preamble queries return numeric scalars. The channel-enable
 * probe path (`DISplay:GLObal:CH<n>:STATE`) is the 5/6 Series spelling.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 4; ch++) {
    s.set(`ch${ch}:enabled`, ch === 1 ? "1" : "0");
    s.set(`ch${ch}:scale`, "1.0000E+00");
    s.set(`ch${ch}:offset`, "0");
    s.set(`ch${ch}:coupling`, "DC");
    s.set(`ch${ch}:probegain`, "0.1");
  }
  s.set("horiz:scale", "1.0000E-06");
  s.set("horiz:position", "0");
  s.set("trig:mode", "AUTO");
  s.set("trig:edge:source", "CH1");
  s.set("trig:edge:slope", "RISe");
  s.set("trig:level", "0");
  s.set("data:source", "CH1");
  s.set("data:encdg", "RIBinary");
  s.set("data:width", "2");
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

function channelHandler(
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
      if (arg !== undefined) ctx.state.set(key, arg.toUpperCase());
      return { kind: "none" };
    },
  };
}

function enableHandler(pattern: RegExp): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `ch${channel}:enabled`;
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
      }
      const arg = cmd.args[0];
      if (arg !== undefined) {
        ctx.state.set(
          key,
          arg.toUpperCase() === "ON" || arg === "1" ? "1" : "0",
        );
      }
      return { kind: "none" };
    },
  };
}

const curveHandler: CommandHandler = (_cmd, ctx): CommandResult => {
  const width = Number.parseInt(String(ctx.state.get("data:width") ?? "2"), 10);
  const points = 512;
  const bytesPerSample = width === 2 ? 2 : 1;
  const bytes = new Uint8Array(points * bytesPerSample);
  if (bytesPerSample === 2) {
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < points; i += 1) {
      const phase = (i / points) * Math.PI * 4;
      const sample = Math.round(Math.sin(phase) * 10_000);
      view.setInt16(i * 2, sample, false);
    }
  } else {
    for (let i = 0; i < points; i += 1) {
      const phase = (i / points) * Math.PI * 4;
      const unsigned = 128 + Math.round(Math.sin(phase) * 100);
      bytes[i] = Math.max(0, Math.min(255, unsigned));
    }
  }
  return { kind: "binary", bytes: encodeIeee488Block(bytes) };
};

const exactHandlers: Record<string, CommandHandler> = {
  "ACQUIRE:STATE": (): CommandResult => ({ kind: "none" }),
  "ACQUIRE:STOPAFTER": (): CommandResult => ({ kind: "none" }),
  AUTOSET: (): CommandResult => ({ kind: "none" }),
  "AUTOSET:EXECUTE": (): CommandResult => ({ kind: "none" }),
  "TRIGGER:FORCE": (): CommandResult => ({ kind: "none" }),
  "HORIZONTAL:SCALE": scalarHandler("horiz:scale", "1.0000E-06"),
  "HORIZONTAL:SCALE?": scalarHandler("horiz:scale", "1.0000E-06"),
  "HORIZONTAL:POSITION": scalarHandler("horiz:position", "0"),
  "HORIZONTAL:POSITION?": scalarHandler("horiz:position", "0"),
  "TRIGGER:A:MODE": scalarHandler("trig:mode", "AUTO"),
  "TRIGGER:A:MODE?": scalarHandler("trig:mode", "AUTO"),
  "TRIGGER:A:EDGE:SOURCE": scalarHandler("trig:edge:source", "CH1"),
  "TRIGGER:A:EDGE:SOURCE?": scalarHandler("trig:edge:source", "CH1"),
  "TRIGGER:A:EDGE:SLOPE": scalarHandler("trig:edge:slope", "RISe"),
  "TRIGGER:A:EDGE:SLOPE?": scalarHandler("trig:edge:slope", "RISe"),
  "TRIGGER:A:LEVEL": scalarHandler("trig:level", "0"),
  "TRIGGER:A:LEVEL?": scalarHandler("trig:level", "0"),
  "DATA:SOURCE": scalarHandler("data:source", "CH1"),
  "DATA:SOURCE?": scalarHandler("data:source", "CH1"),
  "DATA:ENCDG": scalarHandler("data:encdg", "RIBinary"),
  "DATA:ENCDG?": scalarHandler("data:encdg", "RIBinary"),
  "DATA:WIDTH": scalarHandler("data:width", "2"),
  "DATA:WIDTH?": scalarHandler("data:width", "2"),
  "WFMOUTPRE:XINCR?": (): CommandResult => ({
    kind: "line",
    text: "2.0000E-10",
  }),
  "WFMOUTPRE:XZERO?": (): CommandResult => ({ kind: "line", text: "0" }),
  "WFMOUTPRE:YMULT?": (): CommandResult => ({
    kind: "line",
    text: "1.0000E-04",
  }),
  "WFMOUTPRE:YOFF?": (): CommandResult => ({ kind: "line", text: "0" }),
  "WFMOUTPRE:YZERO?": (): CommandResult => ({ kind: "line", text: "0" }),
  "CURVE?": curveHandler,
  "CURVE": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  enableHandler(/^DISPLAY:GLOBAL:CH([1-8]):STATE\??$/),
  channelHandler(/^CH([1-8]):SCALE\??$/, "scale", "1.0000E+00"),
  channelHandler(/^CH([1-8]):OFFSET\??$/, "offset", "0"),
  channelHandler(/^CH([1-8]):COUPLING\??$/, "coupling", "DC"),
  channelHandler(/^CH([1-8]):PROBE:GAIN\??$/, "probegain", "0.1"),
];

export const tektronixMso54Personality: SimulatorPersonality = {
  id: "tektronix-mso54",
  kind: "oscilloscope",
  idn: "TEKTRONIX,MSO54,{serial},CF:91.1CT FV:1.28.4.7499",
  // Representative 5 Series option string — MSO logic lanes + I2C/SPI bundles.
  opt: "MSO,SR-I2C,SR-SPI,SR-CAN,BW-1000,AFG",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
