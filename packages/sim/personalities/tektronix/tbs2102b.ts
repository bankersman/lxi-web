import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Tektronix TBS2102B — 2-channel / 100 MHz entry benchscope.
 *
 * SCPI surface exercises the **ASCII `CURVE?`** waveform path. The TBS
 * firmware emits the preamble as scalars (`WFMPre:YMULT?`,
 * `WFMPre:XINCR?`, `WFMPre:PT_OFF?`, `WFMPre:YOFF?`, `WFMPre:YZERO?`)
 * and then streams comma-separated signed integers out of `CURVE?`.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 2; ch++) {
    s.set(`select:ch${ch}`, ch === 1 ? "1" : "0");
    s.set(`ch${ch}:scale`, "1.0000E+00");
    s.set(`ch${ch}:offset`, "0.0000E+00");
    s.set(`ch${ch}:coupling`, "DC");
    s.set(`ch${ch}:probe`, "10");
  }
  s.set("horiz:scale", "1.0000E-03");
  s.set("horiz:position", "0");
  s.set("trig:mode", "AUTO");
  s.set("trig:edge:source", "CH1");
  s.set("trig:edge:slope", "RISe");
  s.set("trig:level", "0");
  s.set("data:source", "CH1");
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

function selectChannelHandler(pattern: RegExp): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `select:ch${channel}`;
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

const curveHandler: CommandHandler = (): CommandResult => {
  const points = 256;
  const out: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const phase = (i / points) * Math.PI * 4;
    const s = Math.round(Math.sin(phase) * 100);
    out.push(String(s));
  }
  return { kind: "line", text: out.join(",") };
};

const exactHandlers: Record<string, CommandHandler> = {
  "ACQUIRE:STATE": (): CommandResult => ({ kind: "none" }),
  "ACQUIRE:STOPAFTER": (): CommandResult => ({ kind: "none" }),
  "AUTOSET:EXECUTE": (): CommandResult => ({ kind: "none" }),
  AUTOSET: (): CommandResult => ({ kind: "none" }),
  "TRIGGER:FORCE": (): CommandResult => ({ kind: "none" }),
  TRIGGER: (): CommandResult => ({ kind: "none" }),
  "HORIZONTAL:SCALE": scalarHandler("horiz:scale", "1.0000E-03"),
  "HORIZONTAL:SCALE?": scalarHandler("horiz:scale", "1.0000E-03"),
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
  "WFMPRE:XINCR?": (): CommandResult => ({ kind: "line", text: "4.0000E-06" }),
  "WFMPRE:XZERO?": (): CommandResult => ({ kind: "line", text: "0.0000E+00" }),
  "WFMPRE:YMULT?": (): CommandResult => ({ kind: "line", text: "4.0000E-02" }),
  "WFMPRE:YOFF?": (): CommandResult => ({ kind: "line", text: "0" }),
  "WFMPRE:YZERO?": (): CommandResult => ({ kind: "line", text: "0" }),
  "WFMPRE:PT_OFF?": (): CommandResult => ({ kind: "line", text: "0" }),
  "CURVE?": curveHandler,
  "CURVE": (): CommandResult => ({ kind: "none" }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  selectChannelHandler(/^SELECT:CH([1-4])\??$/),
  channelHandler(/^CH([1-4]):SCALE\??$/, "scale", "1.0000E+00"),
  channelHandler(/^CH([1-4]):OFFSET\??$/, "offset", "0"),
  channelHandler(/^CH([1-4]):COUPLING\??$/, "coupling", "DC"),
  channelHandler(/^CH([1-4]):PROBE\??$/, "probe", "10"),
];

export const tektronixTbs2102bPersonality: SimulatorPersonality = {
  id: "tektronix-tbs2102b",
  kind: "oscilloscope",
  idn: "TEKTRONIX,TBS2102B,{serial},CF:91.1CT FV:v1.30",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
