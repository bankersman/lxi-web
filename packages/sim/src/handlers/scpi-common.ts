import type { CommandHandler, CommandResult } from "../personality.js";

/**
 * Built-in SCPI common commands every simulator personality inherits.
 * Registered **last** in the resolution chain so personality handlers
 * can override any of them if they need bespoke behaviour.
 */
export const commonExactHandlers: Readonly<Record<string, CommandHandler>> = {
  "*IDN?": (_, ctx): CommandResult => ({ kind: "line", text: ctx.idn }),
  "*OPT?": (_, ctx): CommandResult => ({ kind: "line", text: ctx.opt ?? "" }),
  "*CLS": (_, ctx): CommandResult => {
    const queue = getErrorQueue(ctx.state);
    queue.length = 0;
    return { kind: "none" };
  },
  "*RST": (): CommandResult => ({ kind: "none" }),
  "*TST?": (): CommandResult => ({ kind: "line", text: "0" }),
  "*STB?": (): CommandResult => ({ kind: "line", text: "0" }),
  "*ESR?": (): CommandResult => ({ kind: "line", text: "0" }),
  "*ESE?": (): CommandResult => ({ kind: "line", text: "0" }),
  "*SRE?": (): CommandResult => ({ kind: "line", text: "0" }),
  "*OPC": (): CommandResult => ({ kind: "none" }),
  "*OPC?": (): CommandResult => ({ kind: "line", text: "1" }),
  "*WAI": (): CommandResult => ({ kind: "none" }),
  "SYST:ERR?": readErrorQueue,
  "SYSTEM:ERR?": readErrorQueue,
  "SYST:ERROR?": readErrorQueue,
  "SYSTEM:ERROR?": readErrorQueue,
};

function readErrorQueue(_: unknown, ctx: { state: Map<string, unknown> }): CommandResult {
  const queue = getErrorQueue(ctx.state);
  const entry = queue.shift();
  if (!entry) return { kind: "line", text: `0,"No error"` };
  return { kind: "line", text: `${entry.code},"${entry.message}"` };
}

/**
 * Error queue is stored on the session state under a well-known key so
 * multiple handlers (personality + common) share one FIFO.
 */
export const ERROR_QUEUE_KEY = "__errorQueue" as const;

export interface ErrorQueueItem {
  readonly code: number;
  readonly message: string;
}

export function getErrorQueue(state: Map<string, unknown>): ErrorQueueItem[] {
  let queue = state.get(ERROR_QUEUE_KEY) as ErrorQueueItem[] | undefined;
  if (!queue) {
    queue = [];
    state.set(ERROR_QUEUE_KEY, queue);
  }
  return queue;
}

export function pushErrorToState(
  state: Map<string, unknown>,
  code: number,
  message: string,
): void {
  const queue = getErrorQueue(state);
  queue.push({ code, message });
}
