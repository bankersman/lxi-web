import { parseCommand, type ParsedCommand } from "./command.js";
import type {
  CommandHandler,
  CommandResult,
  SimulatorContext,
  SimulatorPersonality,
} from "./personality.js";
import {
  commonExactHandlers,
  getErrorQueue,
  pushErrorToState,
} from "./handlers/scpi-common.js";

export interface SimulatorSessionOptions {
  readonly personality: SimulatorPersonality;
  readonly idn: string;
  readonly opt: string;
  readonly logger?: (msg: string) => void;
}

/**
 * Per-socket SCPI dispatcher. Owns the mutable state map, the error queue,
 * and the handler-resolution chain. Pure in-memory — the TCP transport is
 * handled by the {@link Simulator}.
 */
export class SimulatorSession {
  readonly personality: SimulatorPersonality;
  readonly #idn: string;
  readonly #opt: string;
  readonly #state: Map<string, unknown>;
  readonly #logger?: (msg: string) => void;

  constructor(options: SimulatorSessionOptions) {
    this.personality = options.personality;
    this.#idn = options.idn;
    this.#opt = options.opt;
    this.#state = options.personality.initialState?.() ?? new Map();
    this.#logger = options.logger;
  }

  /** Exposed for tests that want to assert pushed errors / mutated state. */
  get state(): Map<string, unknown> {
    return this.#state;
  }

  pushError(code: number, message: string): void {
    pushErrorToState(this.#state, code, message);
  }

  errorQueueSnapshot(): ReadonlyArray<{ readonly code: number; readonly message: string }> {
    return [...getErrorQueue(this.#state)];
  }

  /** Run one SCPI line through the handler chain. */
  async handleLine(line: string): Promise<CommandResult> {
    const command = parseCommand(line);
    if (command.header.length === 0) return { kind: "none" };
    try {
      return await this.#dispatch(command);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.#logger?.(`[${this.personality.id}] handler error on "${command.raw}": ${msg}`);
      this.pushError(-100, `command error: ${msg}`);
      return command.isQuery
        ? { kind: "line", text: "" }
        : { kind: "none" };
    }
  }

  async #dispatch(command: ParsedCommand): Promise<CommandResult> {
    const ctx: SimulatorContext = {
      personalityId: this.personality.id,
      idn: this.#idn,
      opt: this.#opt,
      fixture: this.personality.fixture ?? {},
      state: this.#state,
      pushError: (code, message) => this.pushError(code, message),
      logger: this.#logger,
    };

    const exact = this.personality.exactHandlers?.[command.normalized];
    if (exact) return exact(command, ctx);

    const prefixes = this.personality.prefixHandlers ?? [];
    for (const entry of prefixes) {
      if (entry.pattern.test(command.normalized)) {
        return entry.handler(command, ctx);
      }
    }

    const fixtureResp = this.personality.fixture?.responses?.[command.normalized];
    if (typeof fixtureResp === "string") {
      return command.isQuery
        ? { kind: "line", text: fixtureResp }
        : { kind: "none" };
    }

    const common = commonExactHandlers[command.normalized];
    if (common) return common(command, ctx);

    this.pushError(-113, `Undefined header: ${command.raw}`);
    return command.isQuery
      ? { kind: "line", text: "" }
      : { kind: "none" };
  }
}

/**
 * Convenience helper — runs a series of lines against a session and returns
 * the results (used by tests so they don't need a TCP socket).
 */
export async function runLines(
  session: SimulatorSession,
  lines: readonly string[],
): Promise<readonly CommandResult[]> {
  const results: CommandResult[] = [];
  for (const line of lines) results.push(await session.handleLine(line));
  return results;
}

/**
 * Shim that lets handlers be invoked without the simulator (used by tests).
 */
export function bindHandler(
  handler: CommandHandler,
  session: SimulatorSession,
): (line: string) => Promise<CommandResult> {
  return async (line) => {
    const command = parseCommand(line);
    const ctx: SimulatorContext = {
      personalityId: session.personality.id,
      idn: "__test",
      opt: "",
      fixture: session.personality.fixture ?? {},
      state: session.state,
      pushError: (code, message) => session.pushError(code, message),
    };
    return await handler(command, ctx);
  };
}
