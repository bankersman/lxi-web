import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../src/personality.js";
import { encodeIeee488Block } from "../../src/handlers/ieee488-block.js";

/**
 * Owon XDS3104AE — entry 4-channel, 100 MHz LXI oscilloscope
 * simulator.
 *
 * The personality deliberately advertises a **Lilliput** manufacturer
 * (Owon's parent company). Some early XDS firmware drops use
 * `Lilliput Electronics` in the IDN field rather than `OWON`; the
 * driver's manufacturer regex is designed to catch both.
 *
 * SCPI surface mirrors what the `OwonXds` driver calls:
 *   - `:CHANnel<n>:DISPlay|SCALe|OFFSet|COUPling|PROBe|BWLimit`
 *   - `:HORIzontal:SCALe|POSition`
 *   - `:TRIGger:EDGE:SOURce|SLOPe|LEVel`, `:TRIGger:SWEep|FORCe`
 *   - `:RUN`, `:STOP`, `:AUToset`, `:ACQuire:SINGLE`
 *   - `:WAVeform:SOURce`, `:WAVeform:PREamble?`, `:WAVeform:DATA?`
 * Preamble format loosely follows the IEEE 488.2 10-field layout
 * Keysight / Siglent use; xincr / xorigin / ymult / yoffset are
 * pinned so the driver's waveform decode produces a sane buffer.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (let ch = 1; ch <= 4; ch++) {
    s.set(`ch${ch}:display`, ch === 1 ? "ON" : "OFF");
    s.set(`ch${ch}:scale`, "1.000000E+00");
    s.set(`ch${ch}:offset`, "0.000000E+00");
    s.set(`ch${ch}:coupling`, "DC");
    s.set(`ch${ch}:probe`, "10");
    s.set(`ch${ch}:bwlimit`, "OFF");
  }
  s.set("horiz:scale", "1.000000E-03");
  s.set("horiz:position", "0");
  s.set("trig:edge:source", "CHANnel1");
  s.set("trig:edge:slope", "POSitive");
  s.set("trig:edge:level", "0");
  s.set("trig:sweep", "AUTO");
  s.set("wav:source", "CHANnel1");
  return s;
}

function scalarChannelHandler(
  pattern: RegExp,
  property: string,
): PrefixHandlerEntry {
  return {
    pattern,
    handler: (cmd, ctx): CommandResult => {
      const match = pattern.exec(cmd.normalized);
      const channel = match?.[1] ?? "1";
      const key = `ch${channel}:${property}`;
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

function scalarHandler(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

const preambleHandler: CommandHandler = (): CommandResult => {
  // IEEE 488.2 10-field preamble:
  //   format,type,points,count,xincrement,xorigin,xreference,yincrement,yorigin,yreference
  const fields = ["1", "0", "1024", "1", "1.0E-6", "0", "0", "0.01", "0", "128"];
  return { kind: "line", text: fields.join(",") };
};

const waveformDataHandler: CommandHandler = (): CommandResult => {
  const points = 1024;
  const bytes = new Uint8Array(points);
  for (let i = 0; i < points; i += 1) {
    const phase = (i / points) * Math.PI * 4;
    bytes[i] = Math.max(0, Math.min(255, 128 + Math.round(Math.sin(phase) * 80)));
  }
  return { kind: "binary", bytes: encodeIeee488Block(bytes) };
};

const exactHandlers: Record<string, CommandHandler> = {
  // `parseCommand` strips leading `:` from headers before matching.
  RUN: (): CommandResult => ({ kind: "none" }),
  STOP: (): CommandResult => ({ kind: "none" }),
  AUTOSET: (): CommandResult => ({ kind: "none" }),
  "ACQUIRE:SINGLE": (): CommandResult => ({ kind: "none" }),
  "TRIGGER:FORCE": (): CommandResult => ({ kind: "none" }),
  "HORIZONTAL:SCALE": scalarHandler("horiz:scale", "1.000000E-03"),
  "HORIZONTAL:SCALE?": scalarHandler("horiz:scale", "1.000000E-03"),
  "HORIZONTAL:POSITION": scalarHandler("horiz:position", "0"),
  "HORIZONTAL:POSITION?": scalarHandler("horiz:position", "0"),
  "TRIGGER:EDGE:SOURCE": scalarHandler("trig:edge:source", "CHANnel1"),
  "TRIGGER:EDGE:SOURCE?": scalarHandler("trig:edge:source", "CHANnel1"),
  "TRIGGER:EDGE:SLOPE": scalarHandler("trig:edge:slope", "POSitive"),
  "TRIGGER:EDGE:SLOPE?": scalarHandler("trig:edge:slope", "POSitive"),
  "TRIGGER:EDGE:LEVEL": scalarHandler("trig:edge:level", "0"),
  "TRIGGER:EDGE:LEVEL?": scalarHandler("trig:edge:level", "0"),
  "TRIGGER:SWEEP": scalarHandler("trig:sweep", "AUTO"),
  "TRIGGER:SWEEP?": scalarHandler("trig:sweep", "AUTO"),
  "WAVEFORM:SOURCE": scalarHandler("wav:source", "CHANnel1"),
  "WAVEFORM:SOURCE?": scalarHandler("wav:source", "CHANnel1"),
  "WAVEFORM:PREAMBLE?": preambleHandler,
  "WAVEFORM:DATA?": waveformDataHandler,
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '+0,"No error"',
  }),
};

const prefixHandlers: readonly PrefixHandlerEntry[] = [
  scalarChannelHandler(/^CHANNEL([1-4]):DISPLAY\??$/, "display"),
  scalarChannelHandler(/^CHANNEL([1-4]):SCALE\??$/, "scale"),
  scalarChannelHandler(/^CHANNEL([1-4]):OFFSET\??$/, "offset"),
  scalarChannelHandler(/^CHANNEL([1-4]):COUPLING\??$/, "coupling"),
  scalarChannelHandler(/^CHANNEL([1-4]):PROBE\??$/, "probe"),
  scalarChannelHandler(/^CHANNEL([1-4]):BWLIMIT\??$/, "bwlimit"),
];

export const owonXds3104aePersonality: SimulatorPersonality = {
  id: "owon-xds3104ae",
  kind: "oscilloscope",
  // Lilliput manufacturer — exercises the registry's parent-company regex.
  idn: "Lilliput Electronics,XDS3104AE,{serial},V1.0.2",
  opt: "",
  exactHandlers,
  prefixHandlers,
  initialState: defaultState,
};
