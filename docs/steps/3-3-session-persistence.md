# 3.3 — Session persistence

## Goal

Reduce repetitive setup: remember **which instruments the operator cares about**
(host/port, label, optional auto-connect) and **reopen saved entries on launch**.
**Single-operator, trusted LAN** — **no** login or accounts (the LXI
instruments themselves accept SCPI without authentication; this is a
local bench utility, not a cloud application).

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3.
- Related: connect API [2-2-rest-and-websocket.md](2-2-rest-and-websocket.md), resilient reconnect [3-2-resilient-connectivity.md](3-2-resilient-connectivity.md).

## Acceptance criteria

- [x] **Saved connection list** persists `{ id, host, port, label, autoConnect, lastConnectedAt }` across app restarts. Storage lives in **browser `localStorage`** under `lxi-web.savedConnections.v1` — nothing crosses the wire, nothing is stored on the server.
- [x] UI to **add**, **remove**, **edit** (label + auto-connect toggle): entries surface as a "Saved connections" pane in the Add-device dialog, with per-row `Connect`, `Rename`, `Forget`, and an auto-connect checkbox. Add happens implicitly when a session opens successfully (see rule below) and explicitly via the Rename / auto-connect toggle. Port / host edits are done via **Forget + re-add** — full intent explicit, minimal UI surface.
- [x] **Rule for implicit add:** every successful `sessions.open(host, port)` upserts into the saved list (dedup by `host:port` case-insensitive) with `autoConnect=false`. The operator opts in to auto-connect per entry; the browser never silently opens a connection that the operator did not explicitly flag.
- [x] **"Reopen saved"** primary action from the dashboard: header button when any saved entries exist, plus a prominent button in the empty-dashboard state. Skips rows that are already live (matched by `host:port`) and reports per-entry failures inline without hanging the whole batch.
- [x] **Auto-reopen on launch**: once per page load, after the first `sessions:init` frame arrives, the store opens every `autoConnect=true` row that isn't already live. Deferred on later WS reconnects so explicit "Disconnect" actions win for the rest of the session.
- [x] Storage is documented as **browser `localStorage`** only, with a **version field** so future schema migrations can be detected and discarded safely.
- [x] No secrets stored. Raw TCP SCPI has no auth today; if a future token shows up, keep it out of this list.
- [x] **Out of scope**: server-side persistence, cloud sync, authentication (this is a local single-operator bench utility).

## Architecture

- **Pinia store** `@/stores/savedConnections.ts` owns the address book.
  - Load: best-effort `JSON.parse` of `localStorage[lxi-web.savedConnections.v1]`; `version` mismatch → treat as empty.
  - Persist: `watch(entries, …, { deep: true })` serializes on every mutation.
  - Normalizer guards against shape drift from older browser tabs (schema bump reset).
  - Methods: `add`, `remove`, `update`, `setAutoConnect`, `markConnected`.
- **Hook into sessions store** (`@/stores/sessions.ts`):
  - `open()` calls `markConnected(host, port)` after a successful POST.
  - First `sessions:init` frame triggers `reopenAutoConnects()` exactly once per page load (guarded by a module-scoped flag).
- **UI surfaces**:
  - `AddDeviceDialog.vue` — new **Saved connections** section above the Scan pane.
  - `SavedConnectionsList.vue` — per-row Connect / Rename / Forget / auto-connect controls with full keyboard support.
  - `DashboardView.vue` — adds a **Reopen saved** button in the header and empty-state whenever the list is non-empty; reports per-entry failures inline.

## Notes

- sessionId is **not** persisted. The server mints a new one on every connect (per 3.2), and the browser never relied on the server remembering either. If the server restarts mid-session, the UI's saved list survives untouched.
- Schema version bump: anything ≠ `1` in `localStorage` is discarded silently. Future migrations should bump the constant and add a reader for the previous shape rather than try to mutate old data in place.
- Forgetting a saved entry does not disconnect a live session. Conversely, clicking Disconnect does not forget the saved entry — the two UIs are intentionally decoupled.
