# 1.1 — Transport and SCPI core

## Goal

Provide a vendor-agnostic SCPI session in `@lxi-web/core`:

- `TcpTransport` — Node `net.Socket`-backed transport with connect, timeouts, and clean disposal.
- `ScpiSession` — line-terminated `write` / `query`, IEEE definite-length binary block reader, optional `*OPC?` / `*WAI`, and a hook for `SYST:ERR?`.

## Acceptance criteria

- [ ] `TcpTransport.connect()` resolves only after the socket is open.
- [ ] `ScpiSession.write(cmd)` appends newline and flushes.
- [ ] `ScpiSession.query(cmd)` returns the trimmed response string.
- [ ] `ScpiSession.queryBinary(cmd)` parses `#<digits><length><bytes>` IEEE block.
- [ ] Connect/read timeouts surface as typed errors with a clear message.
- [ ] Disposal closes the socket and rejects in-flight operations.

## Notes

- No vendor-specific strings live here; keep this module generic.
- Transport is an interface so tests can swap in fakes without touching `net`.
