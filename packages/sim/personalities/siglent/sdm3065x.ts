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
  readFileSync(resolve(here, "sdm3065x.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Siglent SDM3065X personality. A 6½-digit DMM with the full
 * SCPI-1999 surface exposed by the driver: mode select, range, NPLC,
 * triggered reads, temperature, secondary display.
 *
 * The simulator seeds a pleasant default — 4.9998 V on DC volts — and
 * derives values from the selected mode so the dashboard renders a
 * sensible needle even on the very first read.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("mode", "VOLT");
  s.set("range:VOLT", "10");
  s.set("range:VOLT:AC", "10");
  s.set("range:CURR", "2");
  s.set("range:RES", "1000");
  s.set("auto:VOLT", "1");
  s.set("auto:VOLT:AC", "1");
  s.set("auto:CURR", "1");
  s.set("auto:RES", "1");
  s.set("nplc", "10");
  s.set("zero:auto", "ON");
  s.set("trig:source", "IMM");
  s.set("trig:delay", "0");
  s.set("samp:count", "1");
  s.set("calc:func:state", "0");
  s.set("calc:func:sec", "OFF");
  s.set("temp:unit", "C");
  s.set("temp:transducer", "RTD,PT100");
  return s;
}

function seedByMode(mode: string): string {
  switch (mode) {
    case "VOLT":
      return "4.99983";
    case "VOLT:AC":
      return "2.50117";
    case "CURR":
      return "0.00012";
    case "CURR:AC":
      return "0.00013";
    case "RES":
      return "997.345";
    case "FRES":
      return "997.355";
    case "FREQ":
      return "1000.07";
    case "PER":
      return "0.000999";
    case "CAP":
      return "1.004e-6";
    case "DIOD":
      return "0.583";
    case "TEMP":
      return "23.45";
    default:
      return "0.0";
  }
}

const handlers: Record<string, CommandHandler> = {
  "FUNCTION?": (_, ctx): CommandResult => ({
    kind: "line",
    text: `"${String(ctx.state.get("mode") ?? "VOLT")}"`,
  }),
  "READ?": (_, ctx): CommandResult => {
    const mode = String(ctx.state.get("mode") ?? "VOLT");
    return { kind: "line", text: seedByMode(mode) };
  },
  "SYSTEM:ERROR?": (): CommandResult => ({ kind: "line", text: '+0,"No error"' }),
};

function registerConfigure(mode: string): void {
  handlers[`CONFIGURE:${mode}`] = (_, ctx): CommandResult => {
    ctx.state.set("mode", shortMode(mode));
    return { kind: "none" };
  };
}
["VOLTAGE:DC", "VOLTAGE:AC", "CURRENT:DC", "CURRENT:AC", "RESISTANCE", "FRESISTANCE", "FREQUENCY", "PERIOD", "CAPACITANCE", "CONTINUITY", "DIODE", "TEMPERATURE"].forEach(registerConfigure);

function shortMode(configure: string): string {
  switch (configure) {
    case "VOLTAGE:DC":
      return "VOLT";
    case "VOLTAGE:AC":
      return "VOLT:AC";
    case "CURRENT:DC":
      return "CURR";
    case "CURRENT:AC":
      return "CURR:AC";
    case "RESISTANCE":
      return "RES";
    case "FRESISTANCE":
      return "FRES";
    case "FREQUENCY":
      return "FREQ";
    case "PERIOD":
      return "PER";
    case "CAPACITANCE":
      return "CAP";
    case "CONTINUITY":
      return "CONT";
    case "DIODE":
      return "DIOD";
    case "TEMPERATURE":
      return "TEMP";
    default:
      return configure;
  }
}

// Generic SENSe:<fn>:RANGe / :RANGe:AUTO / :NPLCycles / :ZERO:AUTO
const senseRangeHandler: CommandHandler = (cmd, ctx): CommandResult => {
  const m = cmd.normalized.match(
    /^SENSE:(VOLTAGE|CURRENT|RESISTANCE|FRESISTANCE)(?::(DC|AC))?:RANGE(?::(AUTO))?(\??)$/,
  );
  if (!m) return { kind: "none" };
  const fn = m[1];
  const ac = m[2] === "AC";
  const isAuto = m[3] === "AUTO";
  const key = ac ? `${shortKey(fn!)}:AC` : shortKey(fn!);
  if (isAuto) {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(`auto:${key}`) ?? "0") };
    }
    const v = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(`auto:${key}`, v === "ON" || v === "1" ? "1" : "0");
    return { kind: "none" };
  }
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get(`range:${key}`) ?? "10") };
  }
  ctx.state.set(`range:${key}`, cmd.args[0] ?? "10");
  ctx.state.set(`auto:${key}`, "0");
  return { kind: "none" };
};

function shortKey(fn: string): string {
  if (fn === "VOLTAGE") return "VOLT";
  if (fn === "CURRENT") return "CURR";
  if (fn === "RESISTANCE") return "RES";
  if (fn === "FRESISTANCE") return "FRES";
  return fn;
}

const senseNplcHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("nplc") ?? "10") };
  }
  ctx.state.set("nplc", cmd.args[0] ?? "10");
  return { kind: "none" };
};

const senseZeroAutoHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("zero:auto") ?? "ON") };
  }
  ctx.state.set("zero:auto", (cmd.args[0] ?? "ON").toUpperCase());
  return { kind: "none" };
};

const triggerHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.normalized === "TRIGGER:SOURCE" || cmd.normalized === "TRIGGER:SOURCE?") {
    if (cmd.isQuery) return { kind: "line", text: String(ctx.state.get("trig:source") ?? "IMM") };
    ctx.state.set("trig:source", (cmd.args[0] ?? "IMM").toUpperCase());
    return { kind: "none" };
  }
  if (cmd.normalized === "TRIGGER:DELAY" || cmd.normalized === "TRIGGER:DELAY?") {
    if (cmd.isQuery) return { kind: "line", text: String(ctx.state.get("trig:delay") ?? "0") };
    ctx.state.set("trig:delay", cmd.args[0] ?? "0");
    return { kind: "none" };
  }
  if (cmd.normalized === "SAMPLE:COUNT" || cmd.normalized === "SAMPLE:COUNT?") {
    if (cmd.isQuery) return { kind: "line", text: String(ctx.state.get("samp:count") ?? "1") };
    ctx.state.set("samp:count", cmd.args[0] ?? "1");
    return { kind: "none" };
  }
  return { kind: "none" };
};

const calcFunctionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.normalized === "CALCULATE:FUNCTION:STATE" || cmd.normalized === "CALCULATE:FUNCTION:STATE?") {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get("calc:func:state") ?? "0") };
    }
    const v = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set("calc:func:state", v === "ON" || v === "1" ? "1" : "0");
    return { kind: "none" };
  }
  if (cmd.normalized === "CALCULATE:FUNCTION:SEC" || cmd.normalized === "CALCULATE:FUNCTION:SEC?") {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get("calc:func:sec") ?? "OFF") };
    }
    ctx.state.set("calc:func:sec", (cmd.args[0] ?? "OFF").toUpperCase());
    return { kind: "none" };
  }
  return { kind: "none" };
};

const tempUnitHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) return { kind: "line", text: String(ctx.state.get("temp:unit") ?? "C") };
  ctx.state.set("temp:unit", (cmd.args[0] ?? "C").toUpperCase());
  return { kind: "none" };
};

const tempTransducerHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return {
      kind: "line",
      text: String(ctx.state.get("temp:transducer") ?? "RTD,PT100"),
    };
  }
  ctx.state.set("temp:transducer", cmd.args.join(","));
  return { kind: "none" };
};

const exactHandlers: Record<string, CommandHandler> = {
  ...handlers,
  "*TRG": (): CommandResult => ({ kind: "none" }),
  "*SAV": (): CommandResult => ({ kind: "none" }),
  "*RCL": (): CommandResult => ({ kind: "none" }),
  "TRIGGER:SOURCE": triggerHandler,
  "TRIGGER:SOURCE?": triggerHandler,
  "TRIGGER:DELAY": triggerHandler,
  "TRIGGER:DELAY?": triggerHandler,
  "SAMPLE:COUNT": triggerHandler,
  "SAMPLE:COUNT?": triggerHandler,
  "CALCULATE:FUNCTION:STATE": calcFunctionHandler,
  "CALCULATE:FUNCTION:STATE?": calcFunctionHandler,
  "CALCULATE:FUNCTION:SEC": calcFunctionHandler,
  "CALCULATE:FUNCTION:SEC?": calcFunctionHandler,
  "SENSE:TEMPERATURE:UNIT": tempUnitHandler,
  "SENSE:TEMPERATURE:UNIT?": tempUnitHandler,
  "SENSE:TEMPERATURE:TRANSDUCER:TYPE": tempTransducerHandler,
  "SENSE:TEMPERATURE:TRANSDUCER:TYPE?": tempTransducerHandler,
};

export const siglentSdm3065xPersonality: SimulatorPersonality = {
  id: "siglent-sdm3065x",
  kind: "multimeter",
  idn: "Siglent Technologies,SDM3065X,{serial},1.01.01.25",
  opt: "",
  fixture,
  exactHandlers,
  prefixHandlers: [
    { pattern: /^SENSE:(VOLTAGE|CURRENT|RESISTANCE|FRESISTANCE)(?::(DC|AC))?:RANGE/, handler: senseRangeHandler },
    {
      pattern: /:NPLCYCLES(\??)$/,
      handler: senseNplcHandler,
    },
    {
      pattern: /:ZERO:AUTO(\??)$/,
      handler: senseZeroAutoHandler,
    },
  ],
  initialState: defaultState,
};
