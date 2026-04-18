import type { ParsedCommand } from "./command.js";

/**
 * Response returned by a {@link CommandHandler}:
 *
 * - `none` — command was a write; no bytes go back to the client.
 * - `line` — ASCII reply; simulator appends `\n`.
 * - `binary` — raw IEEE 488.2 definite-length block; simulator appends `\n`.
 * - `error` — push `code,"message"` onto the error queue; for queries the
 *   placeholder response is returned, for writes nothing goes back.
 */
export type CommandResult =
  | { readonly kind: "none" }
  | { readonly kind: "line"; readonly text: string }
  | { readonly kind: "binary"; readonly bytes: Uint8Array }
  | {
      readonly kind: "error";
      readonly code: number;
      readonly message: string;
      readonly queryPlaceholder?: string;
    };

/** Entry pushed onto the SCPI error queue. */
export interface ErrorQueueEntry {
  readonly code: number;
  readonly message: string;
}

/**
 * Per-socket mutable state the simulator hands to every handler. Fixtures
 * are the personality's on-disk canned responses; `state` is a free-form
 * key/value store personalities use to keep round-trip setter/getter pairs
 * consistent.
 */
export interface SimulatorContext {
  readonly personalityId: string;
  readonly idn: string;
  readonly opt: string;
  readonly fixture: PersonalityFixture;
  readonly state: Map<string, unknown>;
  pushError(code: number, message: string): void;
  /** Optional personality-side logger, threaded from the simulator config. */
  readonly logger?: (msg: string) => void;
}

/** One handler covers a single exact command or a family of prefixes. */
export type CommandHandler = (
  command: ParsedCommand,
  ctx: SimulatorContext,
) => CommandResult | Promise<CommandResult>;

export interface PrefixHandlerEntry {
  readonly pattern: RegExp;
  readonly handler: CommandHandler;
}

/**
 * Shape of a JSON fixture. Only `responses` is inspected by the default
 * resolution path — richer fixtures may add arbitrary data for handlers
 * to read via `ctx.fixture`.
 */
export interface PersonalityFixture {
  readonly responses?: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}

export interface SimulatorPersonality {
  readonly id: string;
  /** Optional kind for introspection / doc generation. */
  readonly kind?: string;
  /** `*IDN?` template; `{serial}` is replaced per instance. */
  readonly idn: string;
  /** `*OPT?` response; empty string if the personality has no options. */
  readonly opt?: string;
  /** Personality-shipped fixture (optional). */
  readonly fixture?: PersonalityFixture;
  /** Exact-match handlers keyed by the `normalized` header (e.g. `CHANNEL1:SCALE?`). */
  readonly exactHandlers?: Readonly<Record<string, CommandHandler>>;
  /** Ordered prefix handlers; first match wins. */
  readonly prefixHandlers?: readonly PrefixHandlerEntry[];
  /**
   * Factory for the per-session state map. Called once per socket so each
   * connection keeps isolated mutable state.
   */
  readonly initialState?: () => Map<string, unknown>;
}
