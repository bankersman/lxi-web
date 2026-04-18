# 2.2 — REST + WebSocket API

## Goal

Thin Fastify surface over the session manager.

## Acceptance criteria

### REST

- [ ] `POST /api/sessions` — body `{ host, port }`; returns `{ session }`.
- [ ] `GET /api/sessions` — returns `{ sessions: Session[] }`.
- [ ] `DELETE /api/sessions/:id` — closes and removes.
- [ ] `POST /api/sessions/:id/scpi` — body `{ cmd, expectReply? }`; returns `{ reply? }` for raw SCPI fallback.
- [ ] Typed DTOs shared via `@lxi-web/core`.

### WebSocket

- [ ] `GET /ws` — server pushes `sessions:update` whenever lifecycle events fire.
- [ ] Client sends `{ type: "subscribe", sessionId }` / `{ type: "unsubscribe", sessionId }` to manage per-device streams.
- [ ] All messages include a `sessionId` so streams cannot mix between devices.

## Notes

- No auth in v1; assume trusted LAN.
