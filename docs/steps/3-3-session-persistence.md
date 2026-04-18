# 3.3 — Session persistence

## Goal

Reduce repetitive setup: remember **which instruments the operator cares about**
(host/port, optional label/order) and optionally **reopen the last bench session**
on launch. **Single-operator, trusted LAN** — **no** login or accounts (see
Epic 6 in `progress.md`).

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3.
- Related: connect API [2-2-rest-and-websocket.md](2-2-rest-and-websocket.md).

## Acceptance criteria

- [ ] Persist a **saved connection list** (at minimum: host, port; optional: label, sort order) across app restarts.
- [ ] UI to **add/remove/edit** saved entries without connecting (or derive from last successful connects — document the rule).
- [ ] **“Reconnect all”** or **“Open last session”** (choose one clear primary action) from the dashboard on launch, with safe behavior if a host is offline (clear error, no hang).
- [ ] Storage location chosen and documented: e.g. **server-side JSON file** next to the API process, or **client localStorage** for the list only — consistent with single-user deployment in the factsheet.
- [ ] Does **not** store secrets (none expected for raw TCP SCPI today); if a future token exists, exclude it from this step’s scope.
- [ ] **Out of scope:** authentication, multi-user isolation, cloud sync.

## Notes

- If **3.2** assigns **new** `sessionId`s on reconnect, persistence is about **addresses**, not stable session UUIDs — make that explicit in UX copy.
