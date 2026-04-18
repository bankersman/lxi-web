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
- [x] Clients `subscribe` / `unsubscribe` to reading topics over the same socket; the server runs one scheduler loop per `(sessionId, topic)` and fans the result out to every subscriber (see **Live reading subscriptions** below). REST endpoints remain for one-shot reads and user-initiated writes.

## Live reading subscriptions

Every recurring "reading" feed that used to be polled over HTTP now moves
through the WebSocket. The wire protocol is tiny and intentionally dumb so
new topics can be added without a migration:

```ts
// Client → server
{ type: "subscribe",   sessionId: string, topic: ReadingTopic }
{ type: "unsubscribe", sessionId: string, topic: ReadingTopic }

// Server → client
{ type: "reading:update", sessionId, topic, payload: unknown, measuredAt }
{ type: "reading:error",  sessionId, topic, message: string, at }
```

### Current topics

| Topic              | Tick    | Payload                    | Facade call                    |
| ------------------ | ------- | -------------------------- | ------------------------------ |
| `dmm.reading`      | 750 ms  | `MultimeterReading`        | `IMultimeter.read()`           |
| `dmm.dualReading`  | 1000 ms | `MultimeterDualReading`    | `IMultimeter.readDual()`       |
| `psu.channels`     | 1500 ms | `PsuChannelState[]`        | `IPowerSupply.getChannels()`   |
| `psu.tracking`     | 3000 ms | `{ supported, channels, enabled }` | `IPowerSupply.getTracking()` |
| `psu.protection`   | 3000 ms | `{ supported, channels: { channel, ovp, ocp }[] }` | `IPowerSupply.getProtection()` per channel |
| `scope.channels`   | 3000 ms | `OscilloscopeChannelState[]` | `IOscilloscope.getChannels()` |
| `scope.timebase`   | 3000 ms | `TimebaseState`            | `IOscilloscope.getTimebase()`  |

### Server behaviour

- **Reference-counted scheduling.** The first subscriber to a
  `(sessionId, topic)` pair starts a scheduler loop; the last unsubscribe
  stops it. Multiple panels (e.g. DMM detail + dashboard mini tile)
  collapse into a single instrument poll.
- **Last value replay.** A new subscriber receives the last known
  `reading:update` immediately if one is cached, so mounted components are
  never blank for longer than necessary.
- **Errors don't tear down the loop.** Transient instrument errors are
  broadcast as `reading:error` but the scheduler keeps ticking; a
  subscription only ends on unsubscribe, socket close, or session removal.
- **Reconnect is transparent.** The web client re-sends every active
  `subscribe` on socket reopen, so a server restart or network blip
  resumes live readings without panel-side retry logic.

### Where to use WS vs REST

| Use WebSocket                                  | Use REST                                   |
| ---------------------------------------------- | ------------------------------------------ |
| Continuous live feeds that multiple panels share | One-shot reads driven by navigation / mount |
| Anything with a fixed cadence > ~1× per second  | Capability descriptors (ranging, trigger, math) |
| Anything the dashboard card and detail page both show | User-initiated writes (mode change, Apply) |
|                                                 | Event-driven snapshots (post-recall refresh) |

### Adding a new topic

1. Extend `ReadingTopic` in `packages/core/src/dto/messages.ts`.
2. Map it to an interval + facade call in
   `packages/server/src/ws/reading-scheduler.ts`.
3. Replace the `usePolling` call in the affected Vue panel with
   `useLiveReading(() => sessionId, "your.topic", { enabled })`.
4. Keep the equivalent HTTP endpoint for one-shot refreshes after
   user-initiated writes.

## Notes

- No auth in v1; assume trusted LAN.
