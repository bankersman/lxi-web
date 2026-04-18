# 3.2 — Resilient connectivity

## Goal

Make TCP sessions **fail visibly and recover predictably** when the LAN glitches
(Wi‑Fi drops, cable wiggle, instrument sleep). Operators should see **connection
lost**, get a **clear retry path**, and keep the same dashboard card / URL so
live subscriptions and the router survive a transient failure.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3.
- Related: session manager [2-1-multi-session-backend.md](2-1-multi-session-backend.md), WebSocket [2-2-rest-and-websocket.md](2-2-rest-and-websocket.md).

## Acceptance criteria

- [x] **Detect** dead TCP sessions: `TcpTransport` already turns peer resets, read-side errors, and connect timeouts into `onClose(err)` events; `ScpiSession.onClose(listener)` now re-exposes those events so the session manager can react.
- [x] **Propagate** connection state: on unexpected close the server flips the session to `status: "error"` with `error.message` and emits a `sessions:update` over the WebSocket — the dashboard card and `/device/:sessionId` show the Error pill plus the upstream error text (never color-only).
- [x] **Retry** affordance: both the dashboard card and the device detail header grow a **Reconnect** button when `status === "error"`; it calls `POST /api/sessions/:id/reconnect`, the server flips back to `connecting`, and the existing connect / identify / driver-resolution flow runs again in-place.
- [x] **`sessionId` semantics**: the `sessionId` **stays stable** across reconnects. The server never persists session state across process restarts (per the "all storage in the browser" constraint), so when the process dies every card goes away client-side via the WS `close` plus list refresh; the browser's saved-connections list (3.3) will re-open them and get fresh ids at that point. Inside a single server lifetime, error → reconnect → connected keeps the same id, and the router URL, WebSocket topic subscriptions, and Pinia store entries survive unchanged.
- [x] Automatic exponential backoff is **intentionally out of scope** for this pass. A solo-operator bench already has a human looking at the screen when something goes wrong; silent auto-retry hides problems (wrong subnet, unplugged cable) longer than it solves them. The store can grow a `reconnect(id, { auto: true })` flag later if a real use case shows up.
- [x] **WebSocket continues** to reflect session list changes during a drop: the session is not removed, so no `sessions:removed` frame fires; live reading subscriptions (`reading:error` etc.) propagate the underlying failure to subscribers so panels stop polling on a dead socket.

## Architecture

- **`ScpiSession.onClose(listener)`** (`packages/core/src/scpi/session.ts`): listeners fire only on **unexpected** transport loss. Explicit `close()` takes the `#closed = true` path and skips the listeners (the caller already knows).
- **`SessionManager`** (`packages/server/src/sessions/manager.ts`):
  - After a successful `#establish`, subscribes to `scpi.onClose` and stores the dispose fn on the internal session row. On drop: status → `error`, error message recorded, facade / scpi cleared, row kept, `sessions:update` emitted.
  - New `reconnect(id)` resets the errored row back to `connecting`, clears identity / driver / facade, and re-runs `#establish`. No-op if the session is already `connecting` or `connected`. Returns `null` if the id is unknown.
  - `close()` disposes the close listener before closing the transport, so a close-during-close does not bounce back as an "unexpected" drop.
- **REST**: `POST /api/sessions/:id/reconnect` (`packages/server/src/routes/sessions.ts`). Returns `{ session }` with the new `connecting` summary, or 404 on unknown id.
- **Web**:
  - `api.reconnectSession(id)` and a `sessions.reconnect(id)` store action.
  - `DeviceCard.vue` and `DeviceView.vue` render a **Reconnect** button on `status === "error"` with per-component loading / error states. The `StatusIndicator` dot is augmented by textual state ("Error") and the upstream error message so the UI is never color-only.

## Notes

- Deep **stateful resume** of instrument setup (recall last SCPI configuration) is still deferred to device presets (2.5e / 2.6c / 2.7c) and 3.3 (saved connections). This step is transport-level resilience only.
- On server restart, every session is gone. That is by design: the server is stateless, and 3.3 makes the browser remember the address book so the operator's "reopen" flow is one click away.
