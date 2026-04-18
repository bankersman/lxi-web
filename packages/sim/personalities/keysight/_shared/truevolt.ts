import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  SimulatorPersonality,
} from "../../../src/personality.js";

/**
 * Shared command table for Keysight Truevolt DMM personalities
 * (34450A / 34461A / 34465A / 34470A plus legacy 34410A / 34411A).
 *
 * The simulator keeps one mode token per session and returns a
 * function-dependent synthetic reading on `READ?` / `FETCh?`. Range,
 * auto-zero, NPLC, trigger source, sample count, calculate-function,
 * temperature unit + transducer all round-trip through a simple
 * get/set table so tests can assert consistency.
 *
 * `FUNCtion?` replies are quoted strings per the real firmware:
 *   - `"VOLT"` / `"VOLT:AC"` / `"CURR"` etc. The unquote helper in the
 *     driver strips the wrapping quotes.
 */

interface SyntheticSample {
  readonly value: number;
}

const DEFAULT_SAMPLE: Record<string, SyntheticSample> = {
  VOLT: { value: 0.1234 },
  "VOLT:AC": { value: 0.2345 },
  CURR: { value: 0.0123 },
  "CURR:AC": { value: 0.0234 },
  RES: { value: 1000.0 },
  FRES: { value: 1000.5 },
  FREQ: { value: 1000.0 },
  PER: { value: 0.001 },
  CAP: { value: 1e-6 },
  CONT: { value: 5.0 },
  DIOD: { value: 0.65 },
  TEMP: { value: 25.5 },
};

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("function", "VOLT");
  s.set("volt:dc:range", "10");
  s.set("volt:dc:range:auto", "1");
  s.set("volt:dc:nplc", "1");
  s.set("volt:dc:zero:auto", "1");
  s.set("volt:ac:range", "10");
  s.set("volt:ac:range:auto", "1");
  s.set("curr:dc:range", "0.1");
  s.set("curr:dc:range:auto", "1");
  s.set("curr:dc:nplc", "1");
  s.set("curr:ac:range", "0.1");
  s.set("curr:ac:range:auto", "1");
  s.set("res:range", "1000");
  s.set("res:range:auto", "1");
  s.set("res:nplc", "1");
  s.set("fres:range", "1000");
  s.set("fres:range:auto", "1");
  s.set("fres:nplc", "1");
  s.set("cap:range", "1e-6");
  s.set("cap:range:auto", "1");
  s.set("trig:source", "IMM");
  s.set("trig:delay", "0");
  s.set("sample:count", "1");
  s.set("calc:state", "0");
  s.set("calc:sec", "VOLT:AC");
  s.set("temp:unit", "C");
  s.set("temp:transducer", "FRTD,PT100");
  return s;
}

function currentFunctionToken(ctx: { state: Map<string, unknown> }): string {
  return String(ctx.state.get("function") ?? "VOLT").toUpperCase();
}

const functionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: `"${currentFunctionToken(ctx)}"` };
  }
  // Writing `FUNCtion "VOLT"` or `FUNCtion VOLT:AC` — normalise.
  const raw = (cmd.args[0] ?? "VOLT").replace(/^"|"$/g, "").toUpperCase();
  ctx.state.set("function", raw);
  return { kind: "none" };
};

function configureHandler(token: string): CommandHandler {
  return (_cmd, ctx): CommandResult => {
    ctx.state.set("function", token);
    return { kind: "none" };
  };
}

const readHandler: CommandHandler = (_cmd, ctx): CommandResult => {
  const token = currentFunctionToken(ctx);
  const sample = DEFAULT_SAMPLE[token] ?? { value: 0 };
  // Truevolt emits engineering notation with 15 significant figures.
  return { kind: "line", text: sample.value.toExponential(6) };
};

function scalarGetSet(key: string, fallback: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
    }
    ctx.state.set(key, cmd.args[0] ?? fallback);
    return { kind: "none" };
  };
}

function boolGetSet(key: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? "1") };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    // Truevolt also takes `ONCE` for AUTO:ZERO — store verbatim.
    if (arg === "ONCE") {
      ctx.state.set(key, "ONCE");
    } else {
      ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
    }
    return { kind: "none" };
  };
}

const noop: CommandHandler = (): CommandResult => ({ kind: "none" });

export interface TrueVoltPersonalityConfig {
  readonly id: string;
  readonly idn: string;
  readonly opt?: string;
  readonly fixture: PersonalityFixture;
}

export function buildTrueVoltPersonality(
  config: TrueVoltPersonalityConfig,
): SimulatorPersonality {
  const exactHandlers: Record<string, CommandHandler> = {
    "FUNCTION": functionHandler,
    "FUNCTION?": functionHandler,
    "CONFIGURE:VOLTAGE:DC": configureHandler("VOLT"),
    "CONFIGURE:VOLTAGE:AC": configureHandler("VOLT:AC"),
    "CONFIGURE:CURRENT:DC": configureHandler("CURR"),
    "CONFIGURE:CURRENT:AC": configureHandler("CURR:AC"),
    "CONFIGURE:RESISTANCE": configureHandler("RES"),
    "CONFIGURE:FRESISTANCE": configureHandler("FRES"),
    "CONFIGURE:FREQUENCY": configureHandler("FREQ"),
    "CONFIGURE:PERIOD": configureHandler("PER"),
    "CONFIGURE:CAPACITANCE": configureHandler("CAP"),
    "CONFIGURE:CONTINUITY": configureHandler("CONT"),
    "CONFIGURE:DIODE": configureHandler("DIOD"),
    "CONFIGURE:TEMPERATURE": configureHandler("TEMP"),
    "READ?": readHandler,
    "FETCH?": readHandler,
    // Range / NPLC / AUTO:ZERO: one set per mode prefix.
    "SENSE:VOLTAGE:DC:RANGE": scalarGetSet("volt:dc:range", "10"),
    "SENSE:VOLTAGE:DC:RANGE?": scalarGetSet("volt:dc:range", "10"),
    "SENSE:VOLTAGE:DC:RANGE:AUTO": boolGetSet("volt:dc:range:auto"),
    "SENSE:VOLTAGE:DC:RANGE:AUTO?": boolGetSet("volt:dc:range:auto"),
    "SENSE:VOLTAGE:DC:NPLCYCLES": scalarGetSet("volt:dc:nplc", "1"),
    "SENSE:VOLTAGE:DC:NPLCYCLES?": scalarGetSet("volt:dc:nplc", "1"),
    "SENSE:VOLTAGE:DC:ZERO:AUTO": boolGetSet("volt:dc:zero:auto"),
    "SENSE:VOLTAGE:DC:ZERO:AUTO?": boolGetSet("volt:dc:zero:auto"),
    "SENSE:VOLTAGE:AC:RANGE": scalarGetSet("volt:ac:range", "10"),
    "SENSE:VOLTAGE:AC:RANGE?": scalarGetSet("volt:ac:range", "10"),
    "SENSE:VOLTAGE:AC:RANGE:AUTO": boolGetSet("volt:ac:range:auto"),
    "SENSE:VOLTAGE:AC:RANGE:AUTO?": boolGetSet("volt:ac:range:auto"),
    "SENSE:CURRENT:DC:RANGE": scalarGetSet("curr:dc:range", "0.1"),
    "SENSE:CURRENT:DC:RANGE?": scalarGetSet("curr:dc:range", "0.1"),
    "SENSE:CURRENT:DC:RANGE:AUTO": boolGetSet("curr:dc:range:auto"),
    "SENSE:CURRENT:DC:RANGE:AUTO?": boolGetSet("curr:dc:range:auto"),
    "SENSE:CURRENT:DC:NPLCYCLES": scalarGetSet("curr:dc:nplc", "1"),
    "SENSE:CURRENT:DC:NPLCYCLES?": scalarGetSet("curr:dc:nplc", "1"),
    "SENSE:CURRENT:AC:RANGE": scalarGetSet("curr:ac:range", "0.1"),
    "SENSE:CURRENT:AC:RANGE?": scalarGetSet("curr:ac:range", "0.1"),
    "SENSE:CURRENT:AC:RANGE:AUTO": boolGetSet("curr:ac:range:auto"),
    "SENSE:CURRENT:AC:RANGE:AUTO?": boolGetSet("curr:ac:range:auto"),
    "SENSE:RESISTANCE:RANGE": scalarGetSet("res:range", "1000"),
    "SENSE:RESISTANCE:RANGE?": scalarGetSet("res:range", "1000"),
    "SENSE:RESISTANCE:RANGE:AUTO": boolGetSet("res:range:auto"),
    "SENSE:RESISTANCE:RANGE:AUTO?": boolGetSet("res:range:auto"),
    "SENSE:RESISTANCE:NPLCYCLES": scalarGetSet("res:nplc", "1"),
    "SENSE:RESISTANCE:NPLCYCLES?": scalarGetSet("res:nplc", "1"),
    "SENSE:FRESISTANCE:RANGE": scalarGetSet("fres:range", "1000"),
    "SENSE:FRESISTANCE:RANGE?": scalarGetSet("fres:range", "1000"),
    "SENSE:FRESISTANCE:RANGE:AUTO": boolGetSet("fres:range:auto"),
    "SENSE:FRESISTANCE:RANGE:AUTO?": boolGetSet("fres:range:auto"),
    "SENSE:FRESISTANCE:NPLCYCLES": scalarGetSet("fres:nplc", "1"),
    "SENSE:FRESISTANCE:NPLCYCLES?": scalarGetSet("fres:nplc", "1"),
    "SENSE:CAPACITANCE:RANGE": scalarGetSet("cap:range", "1e-6"),
    "SENSE:CAPACITANCE:RANGE?": scalarGetSet("cap:range", "1e-6"),
    "SENSE:CAPACITANCE:RANGE:AUTO": boolGetSet("cap:range:auto"),
    "SENSE:CAPACITANCE:RANGE:AUTO?": boolGetSet("cap:range:auto"),
    "TRIGGER:SOURCE": scalarGetSet("trig:source", "IMM"),
    "TRIGGER:SOURCE?": scalarGetSet("trig:source", "IMM"),
    "TRIGGER:DELAY": scalarGetSet("trig:delay", "0"),
    "TRIGGER:DELAY?": scalarGetSet("trig:delay", "0"),
    "SAMPLE:COUNT": scalarGetSet("sample:count", "1"),
    "SAMPLE:COUNT?": scalarGetSet("sample:count", "1"),
    "CALCULATE:FUNCTION:STATE": boolGetSet("calc:state"),
    "CALCULATE:FUNCTION:STATE?": boolGetSet("calc:state"),
    "CALCULATE:FUNCTION:SEC": scalarGetSet("calc:sec", "VOLT:AC"),
    "CALCULATE:FUNCTION:SEC?": scalarGetSet("calc:sec", "VOLT:AC"),
    "SENSE:TEMPERATURE:UNIT": scalarGetSet("temp:unit", "C"),
    "SENSE:TEMPERATURE:UNIT?": scalarGetSet("temp:unit", "C"),
    "SENSE:TEMPERATURE:TRANSDUCER:TYPE": scalarGetSet("temp:transducer", "FRTD,PT100"),
    "SENSE:TEMPERATURE:TRANSDUCER:TYPE?": scalarGetSet("temp:transducer", "FRTD,PT100"),
    "*TRG": noop,
  };

  return {
    id: config.id,
    kind: "multimeter",
    idn: config.idn,
    opt: config.opt ?? "",
    fixture: config.fixture,
    exactHandlers,
    initialState: defaultState,
  };
}
