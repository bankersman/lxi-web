import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * GW Instek GDS-1054B — 4-channel 50 MHz entry scope.
 *
 * Waveform readback uses GW Instek's `:CHANnel<n>:MEMory?` ASCII
 * preamble format (header lines + `Raw Waveform Data:` marker +
 * comma-separated signed integers). The driver's `decodeGdsMemory`
 * parses this shape; we emit a compact header (Sampling Period,
 * Vertical Scale, Vertical Position) followed by ~256 samples of a
 * low-frequency sine so the decoder can exercise its preamble parser.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 4; ch += 1) {
    s.set(`ch${ch}:display`, ch === 1 ? "1" : "0");
    s.set(`ch${ch}:scale`, "1.000E+00");
    s.set(`ch${ch}:offset`, "0");
    s.set(`ch${ch}:coupling`, "DC");
    s.set(`ch${ch}:probe`, "1");
  }
  s.set("timebase:scale", "1.000E-03");
  s.set("timebase:position", "0");
  s.set("trig:mode", "AUTO");
  s.set("trig:source", "CH1");
  s.set("trig:edge:slope", "POS");
  s.set("trig:level", "0");
  return s;
}

function channelSet(
  property: string,
  fallback: string,
  transform?: (v: string) => string,
): CommandHandler {
  return (cmd, ctx): CommandResult => {
    const m = /^CHANNEL([1-4]):/.exec(cmd.normalized);
    const ch = m ? Number.parseInt(m[1]!, 10) : 1;
    const key = `ch${ch}:${property}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    const raw = cmd.args[0] ?? fallback;
    ctx.state.set(key, transform ? transform(raw) : raw);
    return { kind: "none" };
  };
}

const displayHandler = channelSet("display", "0", (v) => {
  const u = v.toUpperCase();
  return u === "ON" || u === "1" ? "1" : "0";
});
const scaleHandler = channelSet("scale", "1.000E+00");
const offsetHandler = channelSet("offset", "0");
const couplingHandler = channelSet("coupling", "DC", (v) => v.toUpperCase());
const probeHandler = channelSet("probe", "1");

const memoryHandler: CommandHandler = (cmd): CommandResult => {
  const m = /^CHANNEL([1-4]):MEMORY\?$/.exec(cmd.normalized);
  if (!m) return { kind: "none" };
  const points = 256;
  const samples: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const phase = (i / points) * Math.PI * 4;
    samples.push(String(Math.round(Math.sin(phase) * 100)));
  }
  // Real GDS firmware emits CR-separated header fields followed by
  // `Raw Waveform Data:` and comma-separated samples. The simulator's
  // `\n` terminator forces us onto a single line, so we use `\r` as the
  // intra-reply separator — the decoder strips `\r` before parsing,
  // which means header fields fall back to defaults but the sample body
  // still decodes cleanly.
  const header = [
    "Format,1.00",
    `Memory Length,${points}`,
    "Trigger Address,128",
    "Sampling Period,1.000000e-06",
    "Vertical Scale,2.000e-01",
    "Vertical Position,0.000e+00",
    "Horizontal Scale,1.000e-03",
    "Probe,1",
    "Raw Waveform Data: ",
  ].join("\r");
  return { kind: "line", text: `${header}${samples.join(",")}` };
};

function scalar(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

const exactHandlers: Record<string, CommandHandler> = {
  "TIMEBASE:SCALE": scalar("timebase:scale", "1.000E-03"),
  "TIMEBASE:SCALE?": scalar("timebase:scale", "1.000E-03"),
  "TIMEBASE:POSITION": scalar("timebase:position", "0"),
  "TIMEBASE:POSITION?": scalar("timebase:position", "0"),
  RUN: (): CommandResult => ({ kind: "none" }),
  STOP: (): CommandResult => ({ kind: "none" }),
  AUTOSET: (): CommandResult => ({ kind: "none" }),
  SINGLE: (): CommandResult => ({ kind: "none" }),
  "TRIGGER:FORCE": (): CommandResult => ({ kind: "none" }),
  "TRIGGER:MODE": scalar("trig:mode", "AUTO"),
  "TRIGGER:MODE?": scalar("trig:mode", "AUTO"),
  "TRIGGER:SOURCE": scalar("trig:source", "CH1"),
  "TRIGGER:SOURCE?": scalar("trig:source", "CH1"),
  "TRIGGER:EDGE:SLOPE": scalar("trig:edge:slope", "POS"),
  "TRIGGER:EDGE:SLOPE?": scalar("trig:edge:slope", "POS"),
  "TRIGGER:LEVEL": scalar("trig:level", "0"),
  "TRIGGER:LEVEL?": scalar("trig:level", "0"),
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '0,"No error"' }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  { pattern: /^CHANNEL[1-4]:DISPLAY(\?)?$/, handler: displayHandler },
  { pattern: /^CHANNEL[1-4]:SCALE(\?)?$/, handler: scaleHandler },
  { pattern: /^CHANNEL[1-4]:OFFSET(\?)?$/, handler: offsetHandler },
  { pattern: /^CHANNEL[1-4]:COUPLING(\?)?$/, handler: couplingHandler },
  { pattern: /^CHANNEL[1-4]:PROBE:RATIO(\?)?$/, handler: probeHandler },
  { pattern: /^CHANNEL[1-4]:PROBE(\?)?$/, handler: probeHandler },
  { pattern: /^CHANNEL[1-4]:MEMORY\?$/, handler: memoryHandler },
];

export const gwInstekGds1054bPersonality: SimulatorPersonality = {
  id: "gwinstek-gds1054b",
  kind: "oscilloscope",
  idn: "GW Instek,GDS-1054B,{serial},V1.03",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
