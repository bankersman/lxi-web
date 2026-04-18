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
  readFileSync(resolve(here, "33511b.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Keysight 33511B personality — Trueform 20 MHz, 1-channel signal
 * generator. SCPI uses the `SOURce<n>:` prefix (or bare `SOURce:` for
 * channel 1). Output-side knobs live on `OUTPut<n>:LOAD` + `:STATe`.
 *
 * The surface the 4.7 driver drives:
 *   - `SOURce1:FUNCtion` + `:FREQuency` + `:VOLTage` + `:VOLTage:OFFSet`
 *     + `:PHASe`.
 *   - Waveform modifiers: `FUNCtion:SQUare:DCYCle`, `FUNCtion:RAMP:SYMMetry`,
 *     `FUNCtion:PULSe:WIDTh`.
 *   - `OUTPut1:STATe ON/OFF`, `OUTPut1:LOAD`.
 */

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("ch1:function", "SIN");
  s.set("ch1:frequency", "1000");
  s.set("ch1:voltage", "0.100");
  s.set("ch1:voltage:offset", "0");
  s.set("ch1:phase", "0");
  s.set("ch1:square:dcycle", "50");
  s.set("ch1:ramp:symmetry", "50");
  s.set("ch1:pulse:width", "0.0005");
  s.set("ch1:output:state", "0");
  s.set("ch1:output:load", "50");
  return s;
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

function boolGetSet(key: string): CommandHandler {
  return (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get(key) ?? "0") };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set(key, arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  };
}

const functionHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("ch1:function") ?? "SIN") };
  }
  ctx.state.set("ch1:function", (cmd.args[0] ?? "SIN").toUpperCase());
  return { kind: "none" };
};

const loadHandler: CommandHandler = (cmd, ctx): CommandResult => {
  if (cmd.isQuery) {
    return { kind: "line", text: String(ctx.state.get("ch1:output:load") ?? "50") };
  }
  const arg = (cmd.args[0] ?? "50").toUpperCase();
  // Accept `INF`, `INFINITY`, `9.9E+37`, or a numeric load.
  if (arg === "INF" || arg === "INFINITY" || arg.startsWith("INFIN")) {
    ctx.state.set("ch1:output:load", "9.9E+37");
  } else {
    ctx.state.set("ch1:output:load", arg);
  }
  return { kind: "none" };
};

// SOURce<n>: prefix gets normalized to e.g. SOURCE1:FUNCTION in the
// parser. We also accept the bare SOURCE: form.
const exactHandlers: Record<string, CommandHandler> = {
  "SOURCE:FUNCTION": functionHandler,
  "SOURCE:FUNCTION?": functionHandler,
  "SOURCE1:FUNCTION": functionHandler,
  "SOURCE1:FUNCTION?": functionHandler,
  "SOURCE:FREQUENCY": scalarGetSet("ch1:frequency", "1000"),
  "SOURCE:FREQUENCY?": scalarGetSet("ch1:frequency", "1000"),
  "SOURCE1:FREQUENCY": scalarGetSet("ch1:frequency", "1000"),
  "SOURCE1:FREQUENCY?": scalarGetSet("ch1:frequency", "1000"),
  "SOURCE:VOLTAGE": scalarGetSet("ch1:voltage", "0.100"),
  "SOURCE:VOLTAGE?": scalarGetSet("ch1:voltage", "0.100"),
  "SOURCE1:VOLTAGE": scalarGetSet("ch1:voltage", "0.100"),
  "SOURCE1:VOLTAGE?": scalarGetSet("ch1:voltage", "0.100"),
  "SOURCE:VOLTAGE:OFFSET": scalarGetSet("ch1:voltage:offset", "0"),
  "SOURCE:VOLTAGE:OFFSET?": scalarGetSet("ch1:voltage:offset", "0"),
  "SOURCE1:VOLTAGE:OFFSET": scalarGetSet("ch1:voltage:offset", "0"),
  "SOURCE1:VOLTAGE:OFFSET?": scalarGetSet("ch1:voltage:offset", "0"),
  "SOURCE:PHASE": scalarGetSet("ch1:phase", "0"),
  "SOURCE:PHASE?": scalarGetSet("ch1:phase", "0"),
  "SOURCE1:PHASE": scalarGetSet("ch1:phase", "0"),
  "SOURCE1:PHASE?": scalarGetSet("ch1:phase", "0"),
  "SOURCE:FUNCTION:SQUARE:DCYCLE": scalarGetSet("ch1:square:dcycle", "50"),
  "SOURCE:FUNCTION:SQUARE:DCYCLE?": scalarGetSet("ch1:square:dcycle", "50"),
  "SOURCE1:FUNCTION:SQUARE:DCYCLE": scalarGetSet("ch1:square:dcycle", "50"),
  "SOURCE1:FUNCTION:SQUARE:DCYCLE?": scalarGetSet("ch1:square:dcycle", "50"),
  "SOURCE:FUNCTION:RAMP:SYMMETRY": scalarGetSet("ch1:ramp:symmetry", "50"),
  "SOURCE:FUNCTION:RAMP:SYMMETRY?": scalarGetSet("ch1:ramp:symmetry", "50"),
  "SOURCE1:FUNCTION:RAMP:SYMMETRY": scalarGetSet("ch1:ramp:symmetry", "50"),
  "SOURCE1:FUNCTION:RAMP:SYMMETRY?": scalarGetSet("ch1:ramp:symmetry", "50"),
  "SOURCE:FUNCTION:PULSE:WIDTH": scalarGetSet("ch1:pulse:width", "0.0005"),
  "SOURCE:FUNCTION:PULSE:WIDTH?": scalarGetSet("ch1:pulse:width", "0.0005"),
  "SOURCE1:FUNCTION:PULSE:WIDTH": scalarGetSet("ch1:pulse:width", "0.0005"),
  "SOURCE1:FUNCTION:PULSE:WIDTH?": scalarGetSet("ch1:pulse:width", "0.0005"),
  "OUTPUT:STATE": boolGetSet("ch1:output:state"),
  "OUTPUT:STATE?": boolGetSet("ch1:output:state"),
  "OUTPUT1:STATE": boolGetSet("ch1:output:state"),
  "OUTPUT1:STATE?": boolGetSet("ch1:output:state"),
  "OUTPUT:LOAD": loadHandler,
  "OUTPUT:LOAD?": loadHandler,
  "OUTPUT1:LOAD": loadHandler,
  "OUTPUT1:LOAD?": loadHandler,
};

export const keysight33511bPersonality: SimulatorPersonality = {
  id: "keysight-33511b",
  kind: "signalGenerator",
  idn: "Keysight Technologies,33511B,{serial},A.02.03-3.15",
  opt: "",
  fixture,
  exactHandlers,
  initialState: defaultState,
};
