import type {
  CommandHandler,
  CommandResult,
  PersonalityFixture,
  SimulatorPersonality,
} from "../../src/personality.js";

export interface Dg9xxPersonalityOptions {
  readonly id: string;
  readonly idn: string;
  readonly fixture: PersonalityFixture;
  readonly frequencyMaxHz: number;
  readonly amplitudeMaxVpp: number;
  readonly channelCount: 1 | 2;
}

/**
 * Shared Rigol DG800 / DG900 personality implementation. Each concrete file
 * (DG812, DG932, ...) calls {@link makeDg9xxPersonality} with its own
 * `*IDN?` template and channel-limit table. The handler tree is identical
 * across the family because the SCPI dialect is too.
 */
export function makeDg9xxPersonality(
  options: Dg9xxPersonalityOptions,
): SimulatorPersonality {
  const channels: readonly number[] =
    options.channelCount === 2 ? [1, 2] : [1];

  function defaultState(): Map<string, unknown> {
    const s = new Map<string, unknown>();
    for (const ch of channels) {
      s.set(`ch${ch}:output`, "OFF");
      s.set(`ch${ch}:function`, "SIN");
      s.set(`ch${ch}:freq`, "1000");
      s.set(`ch${ch}:amp`, "1.0");
      s.set(`ch${ch}:offset`, "0");
      s.set(`ch${ch}:phase`, "0");
      s.set(`ch${ch}:duty`, "50");
      s.set(`ch${ch}:symmetry`, "50");
      s.set(`ch${ch}:pulse:width`, "0.0005");
      s.set(`ch${ch}:pulse:lead`, "0.000000005");
      s.set(`ch${ch}:pulse:trail`, "0.000000005");
      s.set(`ch${ch}:impedance`, "50");
      s.set(`ch${ch}:arb`, "SINC");

      s.set(`ch${ch}:mod:state`, "OFF");
      s.set(`ch${ch}:mod:type`, "AM");
      s.set(`ch${ch}:mod:source`, "INT");
      s.set(`ch${ch}:mod:depth`, "50");
      s.set(`ch${ch}:mod:freq`, "1000");
      s.set(`ch${ch}:mod:wave`, "SIN");

      s.set(`ch${ch}:sweep:state`, "OFF");
      s.set(`ch${ch}:sweep:start`, "100");
      s.set(`ch${ch}:sweep:stop`, "1000");
      s.set(`ch${ch}:sweep:time`, "1");
      s.set(`ch${ch}:sweep:spacing`, "LIN");
      s.set(`ch${ch}:sweep:trigger`, "IMM");

      s.set(`ch${ch}:burst:state`, "OFF");
      s.set(`ch${ch}:burst:mode`, "TRIG");
      s.set(`ch${ch}:burst:ncycles`, "1");
      s.set(`ch${ch}:burst:period`, "0.01");
      s.set(`ch${ch}:burst:trigger`, "IMM");
      s.set(`ch${ch}:burst:phase`, "0");
    }
    s.set("sync:phase", "0");
    s.set("sync:clock", "INT");
    return s;
  }

  const chRange = options.channelCount === 2 ? "[12]" : "[1]";
  const chRe = new RegExp(`^OUTPUT(${chRange})\\??$`);

  const clampNumber = (raw: string, min: number, max: number): string => {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return raw;
    return String(Math.max(min, Math.min(max, n)));
  };

  const channelKey = (
    cmd: { normalized: string },
    offset: number,
  ): number => Number.parseInt(cmd.normalized.charAt(offset), 10);

  const simpleSetOrGet = (
    pattern: RegExp,
    keyFn: (ch: number) => string,
    chIndex: number,
    fallback: string,
    clamp?: (raw: string) => string,
  ) => ({
    pattern,
    handler: (cmd: Parameters<CommandHandler>[0], ctx: Parameters<CommandHandler>[1]): CommandResult => {
      const ch = channelKey(cmd, chIndex);
      const key = keyFn(ch);
      if (cmd.isQuery) {
        return { kind: "line", text: String(ctx.state.get(key) ?? fallback) };
      }
      const arg = cmd.args[0] ?? fallback;
      ctx.state.set(key, clamp ? clamp(arg) : arg.toUpperCase());
      return { kind: "none" };
    },
  });

  const channelHandlers: Array<{ pattern: RegExp; handler: CommandHandler }> = [
    {
      pattern: chRe,
      handler: (cmd, ctx): CommandResult => {
        const ch = channelKey(cmd, 6);
        const key = `ch${ch}:output`;
        if (cmd.isQuery) {
          return { kind: "line", text: String(ctx.state.get(key) ?? "OFF") };
        }
        ctx.state.set(key, (cmd.args[0] ?? "OFF").toUpperCase());
        return { kind: "none" };
      },
    },
    {
      pattern: new RegExp(`^OUTPUT(${chRange}):IMPEDANCE\\??$`),
      handler: (cmd, ctx): CommandResult => {
        const ch = channelKey(cmd, 6);
        const key = `ch${ch}:impedance`;
        if (cmd.isQuery) {
          return { kind: "line", text: String(ctx.state.get(key) ?? "50") };
        }
        const raw = (cmd.args[0] ?? "50").toUpperCase();
        ctx.state.set(key, raw.startsWith("INF") || raw === "HZ" ? "INF" : "50");
        return { kind: "none" };
      },
    },
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION\\??$`),
      (ch) => `ch${ch}:function`,
      6,
      "SIN",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FREQUENCY\\??$`),
      (ch) => `ch${ch}:freq`,
      6,
      "0",
      (raw) => clampNumber(raw, 0, options.frequencyMaxHz),
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):VOLTAGE\\??$`),
      (ch) => `ch${ch}:amp`,
      6,
      "1",
      (raw) => clampNumber(raw, 0.002, options.amplitudeMaxVpp),
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):VOLTAGE:OFFSET\\??$`),
      (ch) => `ch${ch}:offset`,
      6,
      "0",
      (raw) => clampNumber(raw, -10, 10),
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):PHASE\\??$`),
      (ch) => `ch${ch}:phase`,
      6,
      "0",
      (raw) => clampNumber(raw, -360, 360),
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION:SQUARE:DCYCLE\\??$`),
      (ch) => `ch${ch}:duty`,
      6,
      "50",
      (raw) => clampNumber(raw, 0, 100),
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION:RAMP:SYMMETRY\\??$`),
      (ch) => `ch${ch}:symmetry`,
      6,
      "50",
      (raw) => clampNumber(raw, 0, 100),
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION:PULSE:WIDTH\\??$`),
      (ch) => `ch${ch}:pulse:width`,
      6,
      "0.0005",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION:PULSE:TRANSITION:LEADING\\??$`),
      (ch) => `ch${ch}:pulse:lead`,
      6,
      "5e-9",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION:PULSE:TRANSITION:TRAILING\\??$`),
      (ch) => `ch${ch}:pulse:trail`,
      6,
      "5e-9",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FUNCTION:ARB\\??$`),
      (ch) => `ch${ch}:arb`,
      6,
      "SINC",
    ),

    // Modulation
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):MOD\\??$`),
      (ch) => `ch${ch}:mod:state`,
      6,
      "OFF",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):MOD:TYPE\\??$`),
      (ch) => `ch${ch}:mod:type`,
      6,
      "AM",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):MOD:AM:SOURCE\\??$`),
      (ch) => `ch${ch}:mod:source`,
      6,
      "INT",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):MOD:AM:DEPTH\\??$`),
      (ch) => `ch${ch}:mod:depth`,
      6,
      "0",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):MOD:AM:INTERNAL:FREQUENCY\\??$`),
      (ch) => `ch${ch}:mod:freq`,
      6,
      "0",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):MOD:AM:INTERNAL:FUNCTION\\??$`),
      (ch) => `ch${ch}:mod:wave`,
      6,
      "SIN",
    ),

    // Sweep
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):SWEEP:STATE\\??$`),
      (ch) => `ch${ch}:sweep:state`,
      6,
      "OFF",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FREQUENCY:START\\??$`),
      (ch) => `ch${ch}:sweep:start`,
      6,
      "0",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):FREQUENCY:STOP\\??$`),
      (ch) => `ch${ch}:sweep:stop`,
      6,
      "0",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):SWEEP:TIME\\??$`),
      (ch) => `ch${ch}:sweep:time`,
      6,
      "1",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):SWEEP:SPACING\\??$`),
      (ch) => `ch${ch}:sweep:spacing`,
      6,
      "LIN",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):SWEEP:TRIGGER:SOURCE\\??$`),
      (ch) => `ch${ch}:sweep:trigger`,
      6,
      "IMM",
    ),

    // Burst
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):BURST:STATE\\??$`),
      (ch) => `ch${ch}:burst:state`,
      6,
      "OFF",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):BURST:MODE\\??$`),
      (ch) => `ch${ch}:burst:mode`,
      6,
      "TRIG",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):BURST:NCYCLES\\??$`),
      (ch) => `ch${ch}:burst:ncycles`,
      6,
      "1",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):BURST:INTERNAL:PERIOD\\??$`),
      (ch) => `ch${ch}:burst:period`,
      6,
      "0.01",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):BURST:TRIGGER:SOURCE\\??$`),
      (ch) => `ch${ch}:burst:trigger`,
      6,
      "IMM",
    ),
    simpleSetOrGet(
      new RegExp(`^SOURCE(${chRange}):BURST:PHASE\\??$`),
      (ch) => `ch${ch}:burst:phase`,
      6,
      "0",
    ),

    // Arbitrary copy — capture the sample name without storing the DAC16
    // payload itself (binary would confuse the line parser anyway).
    {
      pattern: new RegExp(`^SOURCE(${chRange}):DATA:COPY$`),
      handler: (cmd, ctx): CommandResult => {
        const ch = channelKey(cmd, 6);
        const name = (cmd.args[0] ?? "USER").toUpperCase();
        ctx.state.set(`ch${ch}:arb`, name);
        return { kind: "none" };
      },
    },
  ];

  return {
    id: options.id,
    kind: "signalGenerator",
    idn: options.idn,
    opt: "",
    fixture: options.fixture,
    initialState: defaultState,
    exactHandlers: {
      "PHASE:SYNCHRONIZE": (): CommandResult => ({ kind: "none" }),
      "PHASE:SYNCHRONIZE?": (_, ctx): CommandResult => ({
        kind: "line",
        text: String(ctx.state.get("sync:phase") ?? "0"),
      }),
      "SYSTEM:ROSCILLATOR:SOURCE": (cmd, ctx): CommandResult => {
        if (cmd.isQuery) {
          return { kind: "line", text: String(ctx.state.get("sync:clock") ?? "INT") };
        }
        ctx.state.set("sync:clock", (cmd.args[0] ?? "INT").toUpperCase());
        return { kind: "none" };
      },
      "SYSTEM:ROSCILLATOR:SOURCE?": (_, ctx): CommandResult => ({
        kind: "line",
        text: String(ctx.state.get("sync:clock") ?? "INT"),
      }),
    },
    prefixHandlers: channelHandlers,
  };
}
