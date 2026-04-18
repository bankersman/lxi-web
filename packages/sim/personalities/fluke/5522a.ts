import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";

/**
 * Fluke 5522A — multi-function calibrator, exposed via IPowerSupply.
 *
 * Only the narrow set of commands the `FlukeCalibrator` driver actually
 * exercises is modelled:
 *   - `OUT <value>,<unit>` sets the output quantity and stashes it.
 *   - `OUT?` echoes the latest output.
 *   - `OPER` / `STBY` toggle operate mode.
 *   - `OPER?` reads operate mode.
 */
function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  s.set("out:value", "0");
  s.set("out:unit", "V");
  s.set("oper", "0");
  return s;
}

const exactHandlers: Record<string, CommandHandler> = {
  "OUT": (cmd, ctx): CommandResult => {
    // `OUT 10,V` or `OUT 1,A`. The parser splits on comma into args.
    const value = cmd.args[0] ?? "0";
    const unit = (cmd.args[1] ?? "V").toUpperCase();
    ctx.state.set("out:value", value);
    ctx.state.set("out:unit", unit);
    return { kind: "none" };
  },
  "OUT?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: `${String(ctx.state.get("out:value") ?? "0")},${String(ctx.state.get("out:unit") ?? "V")},0`,
  }),
  "OPER": (_cmd, ctx): CommandResult => {
    ctx.state.set("oper", "1");
    return { kind: "none" };
  },
  "STBY": (_cmd, ctx): CommandResult => {
    ctx.state.set("oper", "0");
    return { kind: "none" };
  },
  "OPER?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: String(ctx.state.get("oper") ?? "0"),
  }),
  "SYSTEM:ERROR?": (): CommandResult => ({
    kind: "line",
    text: '+0,"No error"',
  }),
};

export const fluke5522aPersonality: SimulatorPersonality = {
  id: "fluke-5522a",
  kind: "powerSupply",
  idn: "FLUKE,5522A,{serial},1.3",
  opt: "",
  exactHandlers,
  initialState: defaultState,
};
