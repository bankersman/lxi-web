# 2.2 — REST + WebSocket API

## Goal

Thin Fastify surface over the session manager.

## Acceptance criteria

### REST

- [x] `POST /api/sessions` — body `{ host, port }`; returns `{ session }`.
- [x] `GET /api/sessions` — returns `{ sessions: Session[] }`.
- [x] `DELETE /api/sessions/:id` — closes and removes.
- [x] `POST /api/sessions/:id/scpi` — body `{ command, expectReply? }`; returns `{ reply? }` for raw SCPI fallback.
- [x] Typed DTOs shared via `@lxi-web/core` (`SessionSummary`, `ServerMessage`).
- [x] Typed device routes under `/api/sessions/:id/{scope|psu|dmm}/...` that reject when the session is not the right kind.

### WebSocket

- [x] `GET /ws` — server pushes `sessions:init`, `sessions:update`, and `sessions:removed` whenever lifecycle events fire.
- [x] Broadcast carries the full `SessionSummary` so the SPA can reconcile without per-session subscriptions.
- [x] Per-device live polling happens via REST (e.g. DMM reading, PSU measure) — keeps the WS layer tiny in v1.

## Notes

- No auth in v1; assume trusted LAN.
