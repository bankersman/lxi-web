/**
 * Parsed view of a single SCPI command received over the wire.
 *
 * SCPI mnemonics are case-insensitive; the simulator stores them
 * upper-case to make exact / prefix matching in personalities trivial.
 * Leading `:` is preserved because some real instruments only accept
 * the rooted form (`:CHAN1:SCAL?`) — handlers may ignore it.
 */
export interface ParsedCommand {
  /** Raw line as received (trimmed, no terminator). */
  readonly raw: string;
  /** Command mnemonic part, upper-cased (e.g. `":CHANNEL1:SCALE"` or `"*IDN"`). */
  readonly header: string;
  /** Upper-cased header **without** a leading colon, for stable matching. */
  readonly normalized: string;
  /** Comma-separated argument list after the first whitespace; trimmed. */
  readonly args: readonly string[];
  /** True if the header ends with `?`. */
  readonly isQuery: boolean;
}

const WHITESPACE = /\s+/;

export function parseCommand(line: string): ParsedCommand {
  const raw = line.trim();
  if (raw.length === 0) {
    return { raw, header: "", normalized: "", args: [], isQuery: false };
  }
  const spaceIdx = raw.search(WHITESPACE);
  let headerPart: string;
  let argPart: string;
  if (spaceIdx === -1) {
    headerPart = raw;
    argPart = "";
  } else {
    headerPart = raw.slice(0, spaceIdx);
    argPart = raw.slice(spaceIdx).trim();
  }
  const isQuery = headerPart.endsWith("?");
  const header = headerPart.toUpperCase();
  const normalized = header.startsWith(":") ? header.slice(1) : header;
  const args =
    argPart.length === 0
      ? []
      : argPart.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
  return { raw, header, normalized, args, isQuery };
}
