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
  readFileSync(resolve(here, "sdg2042x.fixture.json"), "utf8"),
) as PersonalityFixture;

/**
 * Siglent SDG2042X personality — functional round-trip for the
 * `SiglentSdg` driver's legacy `Cn:BSWV` / `Cn:OUTP` surface. Two
 * channels, full waveform KV state, and programmable output load /
 * polarity. Responses mirror the real unit's echo-header convention
 * (`C1:BSWV WVTP,SINE,FRQ,1000HZ,AMP,1V,OFST,0V`) so the driver's
 * `parseKvPairs` helper finds the right keys.
 */

const DEFAULT_BSWV = {
  WVTP: "SINE",
  FRQ: "1000",
  PERI: "0.001",
  AMP: "1",
  AMPVRMS: "0.353",
  OFST: "0",
  HLEV: "0.5",
  LLEV: "-0.5",
  PHSE: "0",
  DUTY: "50",
  SYM: "50",
  WIDTH: "0.0005",
  RISE: "0.000001",
  FALL: "0.000001",
  DLY: "0",
} as const;

function channelState(): Record<string, string> {
  return { ...DEFAULT_BSWV };
}

function defaultState(): Map<string, unknown> {
  const s = new Map<string, unknown>();
  for (const ch of [1, 2]) {
    s.set(`c${ch}:bswv`, channelState());
    s.set(`c${ch}:outp`, "OFF");
    s.set(`c${ch}:load`, "HZ");
    s.set(`c${ch}:plrt`, "NOR");
  }
  return s;
}

function formatBswvResponse(ch: number, state: Record<string, string>): string {
  const order: (keyof typeof DEFAULT_BSWV)[] = [
    "WVTP",
    "FRQ",
    "PERI",
    "AMP",
    "AMPVRMS",
    "OFST",
    "HLEV",
    "LLEV",
    "PHSE",
  ];
  const parts = order.map((k) => {
    const raw = state[k] ?? DEFAULT_BSWV[k];
    // Add unit suffix for the keys the driver's parser already strips.
    if (k === "FRQ") return `${k},${raw}HZ`;
    if (k === "PERI") return `${k},${raw}S`;
    if (k === "AMP" || k === "AMPVRMS" || k === "OFST" || k === "HLEV" || k === "LLEV") {
      return `${k},${raw}V`;
    }
    return `${k},${raw}`;
  });
  if (state["WVTP"] === "SQUARE") parts.push(`DUTY,${state["DUTY"] ?? "50"}`);
  if (state["WVTP"] === "RAMP") parts.push(`SYM,${state["SYM"] ?? "50"}`);
  if (state["WVTP"] === "PULSE") {
    parts.push(`WIDTH,${state["WIDTH"] ?? "0.0005"}S`);
    parts.push(`RISE,${state["RISE"] ?? "0.000001"}S`);
    parts.push(`FALL,${state["FALL"] ?? "0.000001"}S`);
    parts.push(`DLY,${state["DLY"] ?? "0"}S`);
  }
  return `C${ch}:BSWV ${parts.join(",")}`;
}

function formatOutpResponse(ch: number, state: Map<string, unknown>): string {
  const on = state.get(`c${ch}:outp`) === "ON" ? "ON" : "OFF";
  const load = String(state.get(`c${ch}:load`) ?? "HZ");
  const plrt = String(state.get(`c${ch}:plrt`) ?? "NOR");
  return `C${ch}:OUTP ${on},LOAD,${load},PLRT,${plrt}`;
}

/** Apply a KV argument list onto the per-channel BSWV state. */
function applyBswv(channelState: Record<string, string>, args: readonly string[]): void {
  for (let i = 0; i + 1 < args.length; i += 2) {
    const key = (args[i] ?? "").toUpperCase();
    const value = args[i + 1] ?? "";
    if (!key) continue;
    channelState[key] = value;
  }
}

/** Apply a `C<n>:OUTP` write — first positional arg is ON/OFF / LOAD,<val>. */
function applyOutp(ch: number, args: readonly string[], state: Map<string, unknown>): void {
  if (args.length === 0) return;
  const first = (args[0] ?? "").toUpperCase();
  let i = 0;
  if (first === "ON" || first === "OFF") {
    state.set(`c${ch}:outp`, first);
    i = 1;
  }
  while (i + 1 < args.length) {
    const key = (args[i] ?? "").toUpperCase();
    const value = (args[i + 1] ?? "").toUpperCase();
    if (key === "LOAD") state.set(`c${ch}:load`, value);
    else if (key === "PLRT") state.set(`c${ch}:plrt`, value);
    i += 2;
  }
}

const handlers: Record<string, CommandHandler> = {};

for (const ch of [1, 2]) {
  handlers[`C${ch}:BSWV`] = (cmd, ctx): CommandResult => {
    const bswv = ctx.state.get(`c${ch}:bswv`) as Record<string, string>;
    applyBswv(bswv, cmd.args);
    return { kind: "none" };
  };
  handlers[`C${ch}:BSWV?`] = (_, ctx): CommandResult => {
    const bswv = ctx.state.get(`c${ch}:bswv`) as Record<string, string>;
    return { kind: "line", text: formatBswvResponse(ch, bswv) };
  };
  handlers[`C${ch}:OUTP`] = (cmd, ctx): CommandResult => {
    applyOutp(ch, cmd.args, ctx.state);
    return { kind: "none" };
  };
  handlers[`C${ch}:OUTP?`] = (_, ctx): CommandResult => ({
    kind: "line",
    text: formatOutpResponse(ch, ctx.state),
  });
}

export const siglentSdg2042xPersonality: SimulatorPersonality = {
  id: "siglent-sdg2042x",
  kind: "signalGenerator",
  idn: "Siglent Technologies,SDG2042X,{serial},2.01.01.35",
  opt: "",
  fixture,
  initialState: defaultState,
  exactHandlers: handlers,
};
