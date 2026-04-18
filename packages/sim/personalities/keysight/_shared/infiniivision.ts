import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../../src/personality.js";
import { encodeIeee488Block } from "../../../src/handlers/ieee488-block.js";

/**
 * Shared command table for Keysight InfiniiVision scope personalities
 * (1000X / 2000X / 3000T / 4000X / 6000X). The SCPI dialect is
 * identical across the family; variant differences live in the profile
 * (channels, bandwidth, memory depth) — handled driver-side.
 *
 * Round-trip surface:
 *   - `:CHANnel<n>:DISPlay`, `:SCALe`, `:OFFSet`, `:COUPling`, `:BWLimit`,
 *     `:INVert`, `:UNITs`, `:PROBe`.
 *   - `:TIMebase:SCALe` / `:POSition`.
 *   - `:TRIGger:MODE`, `:SWEep`, `:FORCe`; `:EDGE:SOURce`, `:SLOPe`,
 *     `:LEVel`.
 *   - `:ACQuire:TYPE`, `:COUNt`.
 *   - `:WAVeform:SOURce`, `:FORMat`, `:POINts:MODE`, `:PREamble?`,
 *     `:DATA?` (WORD big-endian block).
 *   - `:DISPlay:DATA?` (PNG header stub).
 *   - `:RUN`, `:STOP`, `:SINGle`, `:AUToscale`.
 */

const WAVEFORM_POINTS = 1024;

function defaultState(channelCount: number): () => Map<string, unknown> {
  return () => {
    const s = new Map<string, unknown>();
    for (let ch = 1; ch <= channelCount; ch += 1) {
      s.set(`ch${ch}:display`, ch === 1 ? "1" : "0");
      s.set(`ch${ch}:scale`, "1.0");
      s.set(`ch${ch}:offset`, "0.0");
      s.set(`ch${ch}:coupling`, "DC");
      s.set(`ch${ch}:bwlimit`, "0");
      s.set(`ch${ch}:invert`, "0");
      s.set(`ch${ch}:units`, "VOLT");
      s.set(`ch${ch}:probe`, "1");
    }
    s.set("timebase:scale", "1e-3");
    s.set("timebase:position", "0");
    s.set("trig:mode", "EDGE");
    s.set("trig:sweep", "AUTO");
    s.set("trig:edge:source", "CHANnel1");
    s.set("trig:edge:slope", "POS");
    s.set("trig:edge:level", "0");
    s.set("acq:type", "NORMAL");
    s.set("acq:count", "8");
    s.set("wave:source", "CHANnel1");
    s.set("wave:format", "WORD");
    s.set("wave:points:mode", "NORMAL");
    s.set("display:persistence", "MIN");
    return s;
  };
}

function scalarGetSet(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function boolGetSet(key: string, fallback = "0"): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  };
}

function channelScalar(
  suffix: string,
  fallback: string,
  channels: number,
  asBool = false,
): CommandHandler {
  const pattern = new RegExp(`^:?CHANNEL([1-${channels}]):${suffix}\\??$`);
  return (cmd, ctx): CommandResult => {
    const m = pattern.exec(cmd.normalized);
    if (!m) return { kind: "none" };
    const ch = m[1];
    const key = `ch${ch}:${suffix.toLowerCase()}`;
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    if (asBool) {
      const arg = (cmd.args[0] ?? "OFF").toUpperCase();
      ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
    } else {
      ctx.state.set(key, cmd.args[0] ?? fallback);
    }
    return { kind: "none" };
  };
}

function buildPreamble(state: Map<string, unknown>): string {
  const src = String(state.get("wave:source") ?? "CHANnel1");
  const m = src.match(/(\d+)/);
  const ch = m ? Number.parseInt(m[1]!, 10) : 1;
  const scale = Number(state.get(`ch${ch}:scale`) ?? 1);
  const offset = Number(state.get(`ch${ch}:offset`) ?? 0);
  const timebase = Number(state.get("timebase:scale") ?? 1e-3);
  const xIncrement = timebase / 100;
  const xOrigin = -timebase * 5;
  const yInc = scale / 3000;
  const yRef = 32768;
  // 10-field InfiniiVision preamble layout:
  //   format,type,points,count,xinc,xorg,xref,yinc,yorg,yref
  return [
    "2", // WORD format
    "0", // NORMal type
    String(WAVEFORM_POINTS),
    "1",
    xIncrement.toExponential(6),
    xOrigin.toExponential(6),
    "0",
    yInc.toExponential(6),
    offset.toExponential(6),
    String(yRef),
  ].join(",");
}

function buildWaveformBlock(): Uint8Array {
  // WORD format — unsigned 16-bit big-endian samples. Synthetic sine
  // that scales through the driver's preamble math back to a
  // recognisable trace.
  const bytes = new Uint8Array(WAVEFORM_POINTS * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < WAVEFORM_POINTS; i += 1) {
    const phase = (i / WAVEFORM_POINTS) * Math.PI * 4;
    const sample = 32768 + Math.round(Math.sin(phase) * 2000);
    view.setUint16(i * 2, sample, false);
  }
  return bytes;
}

const waveformDataHandler: CommandHandler = (_, ctx): CommandResult => {
  const samples = buildWaveformBlock();
  void ctx;
  return { kind: "binary", bytes: encodeIeee488Block(samples) };
};

const displayDataHandler: CommandHandler = (): CommandResult => {
  // Minimal 8-byte PNG header is enough for the driver contract; the
  // dashboard only cares about MIME and round-trip bytes.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { kind: "binary", bytes: encodeIeee488Block(png) };
};

const noop: CommandHandler = (): CommandResult => ({ kind: "none" });

export interface InfiniiVisionPersonalityConfig {
  readonly id: string;
  readonly idn: string;
  readonly opt?: string;
  readonly fixture: PersonalityFixture;
  /** Analog channel count — 2 or 4 for this family. */
  readonly channels: 2 | 4;
}

export function buildInfiniiVisionPersonality(
  config: InfiniiVisionPersonalityConfig,
): SimulatorPersonality {
  const exactHandlers: Record<string, CommandHandler> = {
    "RUN": noop,
    "STOP": noop,
    "SINGLE": noop,
    "AUTOSCALE": noop,
    "TIMEBASE:SCALE": scalarGetSet("timebase:scale", "1e-3"),
    "TIMEBASE:SCALE?": scalarGetSet("timebase:scale", "1e-3"),
    "TIMEBASE:POSITION": scalarGetSet("timebase:position", "0"),
    "TIMEBASE:POSITION?": scalarGetSet("timebase:position", "0"),
    "TRIGGER:MODE": scalarGetSet("trig:mode", "EDGE"),
    "TRIGGER:MODE?": scalarGetSet("trig:mode", "EDGE"),
    "TRIGGER:SWEEP": scalarGetSet("trig:sweep", "AUTO"),
    "TRIGGER:SWEEP?": scalarGetSet("trig:sweep", "AUTO"),
    "TRIGGER:FORCE": noop,
    "TRIGGER:EDGE:SOURCE": scalarGetSet("trig:edge:source", "CHANnel1"),
    "TRIGGER:EDGE:SOURCE?": scalarGetSet("trig:edge:source", "CHANnel1"),
    "TRIGGER:EDGE:SLOPE": scalarGetSet("trig:edge:slope", "POS"),
    "TRIGGER:EDGE:SLOPE?": scalarGetSet("trig:edge:slope", "POS"),
    "TRIGGER:EDGE:LEVEL": scalarGetSet("trig:edge:level", "0"),
    "TRIGGER:EDGE:LEVEL?": scalarGetSet("trig:edge:level", "0"),
    "ACQUIRE:TYPE": scalarGetSet("acq:type", "NORMAL"),
    "ACQUIRE:TYPE?": scalarGetSet("acq:type", "NORMAL"),
    "ACQUIRE:COUNT": scalarGetSet("acq:count", "8"),
    "ACQUIRE:COUNT?": scalarGetSet("acq:count", "8"),
    "WAVEFORM:SOURCE": scalarGetSet("wave:source", "CHANnel1"),
    "WAVEFORM:SOURCE?": scalarGetSet("wave:source", "CHANnel1"),
    "WAVEFORM:FORMAT": scalarGetSet("wave:format", "WORD"),
    "WAVEFORM:FORMAT?": scalarGetSet("wave:format", "WORD"),
    "WAVEFORM:POINTS:MODE": scalarGetSet("wave:points:mode", "NORMAL"),
    "WAVEFORM:POINTS:MODE?": scalarGetSet("wave:points:mode", "NORMAL"),
    "WAVEFORM:PREAMBLE?": (_, ctx): CommandResult => ({
      kind: "line",
      text: buildPreamble(ctx.state),
    }),
    "WAVEFORM:DATA?": waveformDataHandler,
    "DISPLAY:PERSISTENCE": scalarGetSet("display:persistence", "MIN"),
    "DISPLAY:PERSISTENCE?": scalarGetSet("display:persistence", "MIN"),
    "DISPLAY:DATA?": displayDataHandler,
  };

  const prefixHandlers: readonly PrefixHandlerEntry[] = [
    {
      pattern: /^CHANNEL[1-4]:DISPLAY\??$/,
      handler: channelScalar("DISPLAY", "0", config.channels, true),
    },
    {
      pattern: /^CHANNEL[1-4]:SCALE\??$/,
      handler: channelScalar("SCALE", "1.0", config.channels),
    },
    {
      pattern: /^CHANNEL[1-4]:OFFSET\??$/,
      handler: channelScalar("OFFSET", "0.0", config.channels),
    },
    {
      pattern: /^CHANNEL[1-4]:COUPLING\??$/,
      handler: channelScalar("COUPLING", "DC", config.channels),
    },
    {
      pattern: /^CHANNEL[1-4]:BWLIMIT\??$/,
      handler: channelScalar("BWLIMIT", "0", config.channels, true),
    },
    {
      pattern: /^CHANNEL[1-4]:INVERT\??$/,
      handler: channelScalar("INVERT", "0", config.channels, true),
    },
    {
      pattern: /^CHANNEL[1-4]:UNITS\??$/,
      handler: channelScalar("UNITS", "VOLT", config.channels),
    },
    {
      pattern: /^CHANNEL[1-4]:PROBE\??$/,
      handler: channelScalar("PROBE", "1", config.channels),
    },
  ];

  // silence unused lint for boolGetSet when some variants don't need it
  void boolGetSet;

  return {
    id: config.id,
    kind: "oscilloscope",
    idn: config.idn,
    opt: config.opt ?? "",
    fixture: config.fixture,
    exactHandlers,
    prefixHandlers,
    initialState: defaultState(config.channels),
  };
}
