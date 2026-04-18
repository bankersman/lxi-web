# 3.2 — Resilient connectivity

## Goal

Make TCP sessions **fail visibly and recover predictably** when the LAN glitches
(Wi‑Fi drops, cable wiggle, instrument sleep). Operators should see **connection
lost**, get a **clear retry path**, and optional **backoff** so the server does
not hammer a dead peer.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3.
- Related: session manager [2-1-multi-session-backend.md](2-1-multi-session-backend.md), WebSocket [2-2-rest-and-websocket.md](2-2-rest-and-websocket.md).

## Acceptance criteria

- [ ] **Detect** dead TCP sessions (read/write errors, idle timeout policy — document the chosen signals).
- [ ] **Propagate** connection state to the UI: dashboard card and `/device/:sessionId` show **Error** / **Disconnected** (or equivalent) with text, not color-only.
- [ ] **Retry** affordance: user can attempt reconnect from card or detail; behavior is deterministic (no duplicate ghost sessions without cleanup).
- [ ] **Document** `sessionId` semantics: on reconnect, is it always a **new** `sessionId` or does the UI map a “slot” to a new id — pick one and state it in this file and the API notes.
- [ ] Optional: **automatic** retry with exponential backoff for transient failures, capped and cancellable; must not block the whole app.
- [ ] WebSocket continues to reflect session list changes; no cross-session leakage on reconnect.

## Notes

- Deep **stateful resume** of instrument setup (recall last SCPI configuration) may overlap **presets** or **3.3** — avoid duplicating; this step is **transport-level** resilience first.
