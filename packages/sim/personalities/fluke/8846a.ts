import type {
  CommandHandler,
  CommandResult,
  SimulatorPersonality,
} from "../../src/personality.js";
import { fluke8845aPersonality } from "./8845a.js";

/**
 * Fluke 8846A — superset of the 8845A (adds capacitance ranging). The
 * SCPI surface is otherwise identical, so we inherit the 8845A handler
 * table and extend it with the extra `CONFigure:CAPacitance` + range
 * nodes the 8846A firmware accepts.
 */
const capacitanceHandlers: Record<string, CommandHandler> = {
  "CONFIGURE:CAPACITANCE": (_cmd, ctx): CommandResult => {
    ctx.state.set("function", "CAP");
    return { kind: "none" };
  },
  "SENSE:CAPACITANCE:RANGE": (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get("cap:range") ?? "1E-6") };
    }
    ctx.state.set("cap:range", cmd.args[0] ?? "1E-6");
    return { kind: "none" };
  },
  "SENSE:CAPACITANCE:RANGE?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: String(ctx.state.get("cap:range") ?? "1E-6"),
  }),
  "SENSE:CAPACITANCE:RANGE:AUTO": (cmd, ctx): CommandResult => {
    if (cmd.isQuery) {
      return { kind: "line", text: String(ctx.state.get("cap:auto") ?? "1") };
    }
    const arg = (cmd.args[0] ?? "OFF").toUpperCase();
    ctx.state.set("cap:auto", arg === "ON" || arg === "1" ? "1" : "0");
    return { kind: "none" };
  },
  "SENSE:CAPACITANCE:RANGE:AUTO?": (_cmd, ctx): CommandResult => ({
    kind: "line",
    text: String(ctx.state.get("cap:auto") ?? "1"),
  }),
};

export const fluke8846aPersonality: SimulatorPersonality = {
  id: "fluke-8846a",
  kind: "multimeter",
  idn: "FLUKE,8846A,{serial},5.0",
  opt: "",
  exactHandlers: {
    ...fluke8845aPersonality.exactHandlers,
    ...capacitanceHandlers,
  },
  initialState: () => {
    const s = fluke8845aPersonality.initialState
      ? fluke8845aPersonality.initialState()
      : new Map<string, unknown>();
    s.set("cap:range", "1E-6");
    s.set("cap:auto", "1");
    return s;
  },
};
