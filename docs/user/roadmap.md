# Roadmap

A user-facing mirror of the implementation checklist in
[`progress.md`](../../progress.md). The checklist is the source of
truth — this page just explains the larger themes.

## Shipped

- **Epic 1** — backend foundation: session manager, typed SCPI
  transport, device identity + routing, WebSocket feed.
- **Epic 2** — card-grid dashboard, per-kind panels for scope / PSU
  / DMM, raw SCPI fallback, advanced features.
- **Epic 3.1** — LAN discovery via mDNS.
- **Epic 3.2** — resilient connectivity with stable `sessionId`.
- **Epic 3.3** — browser-local saved connections + auto-reopen.
- **Epic 3.4** — device detail UX with an overview card and quick
  actions.

## Next

- **Epic 3.5** — documentation + landing page (this file!).
- **Epic 3.6** — Docker image + release workflow.
- **Epic 3.7** — publish `@lxi-web/core` to npm.

## Further out

- More typed drivers, driven by [hardware reports](./hardware-reports.md).
- A mock-instrument backend for documentation screenshots and tests.
- Optional per-session scripting surface (one-off SCPI macros).
