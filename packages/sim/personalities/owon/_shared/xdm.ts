import type {
  CommandHandler,
  CommandResult,
  PrefixHandlerEntry,
  SimulatorPersonality,
} from "../../../src/personality.js";

/**
 * Shared factory for Owon XDM DMM personalities.
 *
 * Owon firmware is narrower than Keysight / Siglent DMMs: no math /
 * logging / dual display / temperature SCPI. The factory implements
 * exactly the commands the `OwonXdm` driver calls plus enough front-
 * panel compatibility to keep manual `*IDN?` / `SYSTem:ERRor?` probes
 * happy.
 *
 * `xdm1041` exercises the 4½-digit baseline profile (no 4-wire, no
 * auto-zero); `xdm2041` exercises the 5½-digit profile with 4-wire
 * resistance and `*SAV` / `*RCL` support. Both personalities also
 * demonstrate the empty-manufacturer quirk when `idn` is constructed
 * with a blank manufacturer field.
 */

export interface BuildXdmPersonalityOptions {
  readonly id: string;
  readonly idn: string;
  readonly has4Wire: boolean;
  readonly hasPresets: boolean;
  readonly opt?: string;
  /**
   * Optional override for the default reading value emitted on `READ?`
   * in DC-volts mode; defaults to a pleasant 4.99983 V.
   */
  readonly dcVoltDefault?: string;
}

function defaultState(has4Wire: boolean): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("mode", "VOLT");
  s.set("range:VOLT", "10");
  s.set("range:VOLT:AC", "10");
  s.set("range:CURR", "2");
  s.set("range:CURR:AC", "2");
  s.set("range:RES", "1000");
  if (has4Wire) s.set("range:FRES", "1000");
  s.set("auto:VOLT", "1");
  s.set("auto:VOLT:AC", "1");
  s.set("auto:CURR", "1");
  s.set("auto:CURR:AC", "1");
  s.set("auto:RES", "1");
  if (has4Wire) s.set("auto:FRES", "1");
  s.set("nplc", "1");
  s.set("zero:auto", "ON");
  return s;
}

function seedByMode(mode: string, dcVoltDefault: string): string {
  switch (mode) {
    case "VOLT":
      return dcVoltDefault;
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
    case "CONT":
      return "12.4";
    case "DIOD":
      return "0.583";
    default:
      return "0.0";
  }
}

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
    default:
      return configure;
  }
}

function shortKey(fn: string): string {
  if (fn === "VOLTAGE") return "VOLT";
  if (fn === "CURRENT") return "CURR";
  if (fn === "RESISTANCE") return "RES";
  if (fn === "FRESISTANCE") return "FRES";
  return fn;
}

export function buildXdmPersonality(opts: BuildXdmPersonalityOptions): SimulatorPersonality {
  const dcVoltDefault = opts.dcVoltDefault ?? "4.99983";
  const has4Wire = opts.has4Wire;
  const hasPresets = opts.hasPresets;

  const handlers: Record<string, CommandHandler> = {
    "FUNCTION?": (_, ctx): CommandResult => ({
      kind: "line",
      text: `"${String(ctx.state.get("mode") ?? "VOLT")}"`,
    }),
    "READ?": (_, ctx): CommandResult => {
      const mode = String(ctx.state.get("mode") ?? "VOLT");
      return { kind: "line", text: seedByMode(mode, dcVoltDefault) };
    },
    "MEASURE:VOLTAGE:DC?": (_, ctx): CommandResult => {
      ctx.state.set("mode", "VOLT");
      return { kind: "line", text: dcVoltDefault };
    },
    "SYSTEM:ERROR?": (): CommandResult => ({
      kind: "line",
      text: '+0,"No error"',
    }),
  };

  const configureNodes: readonly string[] = [
    "VOLTAGE:DC",
    "VOLTAGE:AC",
    "CURRENT:DC",
    "CURRENT:AC",
    "RESISTANCE",
    ...(has4Wire ? ["FRESISTANCE"] : []),
    "FREQUENCY",
    "PERIOD",
    "CAPACITANCE",
    "CONTINUITY",
    "DIODE",
  ];
  for (const node of configureNodes) {
    handlers[`CONFIGURE:${node}`] = (_, ctx): CommandResult => {
      ctx.state.set("mode", shortMode(node));
      return { kind: "none" };
    };
  }

  const senseRangeHandler: CommandHandler = (cmd, ctx): CommandResult => {
    const m = cmd.normalized.match(
      /^SENSE:(VOLTAGE|CURRENT|RESISTANCE|FRESISTANCE)(?::(DC|AC))?:RANGE(?::(AUTO))?\??$/,
    );
    if (!m) return { kind: "none" };
    const fn = m[1]!;
    if (!has4Wire && fn === "FRESISTANCE") {
      // 4½-digit XDMs drop the 4-wire node with -113.
      return { kind: "error", code: -113, message: "Undefined header" };
    }
    const ac = m[2] === "AC";
    const isAuto = m[3] === "AUTO";
    const key = ac ? `${shortKey(fn)}:AC` : shortKey(fn);
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

  const senseNplcHandler: CommandHandler = (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get("nplc") ?? "1") };
    }
    ctx.state.set("nplc", cmd.args[0] ?? "1");
    return { kind: "none" };
  };

  const senseZeroAutoHandler: CommandHandler = (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get("zero:auto") ?? "ON") };
    }
    ctx.state.set("zero:auto", (cmd.args[0] ?? "ON").toUpperCase());
    return { kind: "none" };
  };

  const prefixHandlers: readonly PrefixHandlerEntry[] = [
    {
      pattern:
        /^SENSE:(VOLTAGE|CURRENT|RESISTANCE|FRESISTANCE)(?::(DC|AC))?:RANGE/,
      handler: senseRangeHandler,
    },
    {
      pattern: /:NPLCYCLES(\??)$/,
      handler: senseNplcHandler,
    },
    {
      pattern: /:ZERO:AUTO(\??)$/,
      handler: senseZeroAutoHandler,
    },
  ];

  const exactHandlers: Record<string, CommandHandler> = { ...handlers };
  if (hasPresets) {
    exactHandlers["*SAV"] = () => ({ kind: "none" });
    exactHandlers["*RCL"] = () => ({ kind: "none" });
  }

  return {
    id: opts.id,
    kind: "multimeter",
    idn: opts.idn,
    opt: opts.opt ?? "",
    exactHandlers,
    prefixHandlers,
    initialState: () => defaultState(has4Wire),
  };
}
