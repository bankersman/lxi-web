# 5.1 — Cross-device event bus and action catalog

## Goal

Give the backend a vendor-neutral way to **publish events** from every
connected instrument and **invoke actions** on any instrument, so higher-level
orchestration (rules, sequences, timelines — 5.2–5.4) can be written without
knowing which façade or driver is underneath.

This is the plumbing layer for Epic 5. No rules, sequences, or UI workflows
are introduced here; they consume what this step exposes.

## Scope

### Event model

A `DeviceEvent` is a discriminated union stamped with `sessionId`, wall-clock
`timestamp`, and a monotonic `seq` per session:

| Kind                     | Notes                                                |
| ------------------------ | ---------------------------------------------------- |
| `triggerFired`           | Scope / counter — armed capture completed.           |
| `measurementSample`      | DMM primary reading, PSU channel V/I readback.       |
| `outputStateChanged`     | PSU output on/off per channel, scope run/stop.       |
| `protectionTripped`      | OVP/OCP trip (see 2.5) and future safety interlocks. |
| `errorFlagRaised`        | `SYST:ERR?`-style error queue entries.               |
| `connectionStateChanged` | Already emitted by 2.1; republished on the bus.      |

Events are **cheap** — a measurement sample carries value + unit + channel id
only, never full waveforms. Waveform captures reference a capture id so large
blobs stay out of the event stream.

### Event sources

Each façade opts in via a small `InstrumentEventSource` helper:

- Pollers that already exist (scope status, DMM sample, PSU V/I readback)
  publish to the bus instead of only feeding their own component.
- Drivers that natively signal (e.g. OVP/OCP trip via `:OUTPut:OVP:QUES?`)
  publish immediately on the polling tick that first sees the change.
- Unknown / raw-SCPI sessions emit only `connectionStateChanged` and
  `errorFlagRaised`; everything else requires a façade.

### Action catalog

Each façade exposes a typed `ActionCatalog`:

```ts
interface InstrumentAction<TInput, TOutput> {
  readonly id: string;           // e.g. "psu.setOutput"
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema?: JsonSchema;
  run(input: TInput, ctx: ActionContext): Promise<TOutput>;
}
```

Initial coverage:

- Scope: `scope.armSingle`, `scope.stop`, `scope.readWaveform`,
  `scope.setTimebase`.
- PSU: `psu.setOutput`, `psu.setVoltage`, `psu.setCurrent`,
  `psu.clearProtection` (reuses 2.5 capability when present).
- DMM: `dmm.setMode`, `dmm.readPrimary`.
- Common: `common.trg` → writes `*TRG` (IEEE 488.2) and `common.raw` for
  escape-hatch raw SCPI (requires explicit flag, logged as warning).

### REST and WebSocket

- `GET /api/sessions/:id/events/schema` — event kinds this session can emit.
- `GET /api/sessions/:id/actions` — catalog with JSON schemas and labels.
- `POST /api/sessions/:id/actions/:actionId` — invoke; body validated against
  the action's input schema.
- WebSocket adds an `events` channel: clients subscribe with
  `{ type: "subscribe", sessionIds?: string[], kinds?: EventKind[] }`.
  Messages are batched at ~100 ms to keep the UI from drowning.

### Backend internals

- `EventBus` is a plain in-process emitter; the WebSocket layer is a
  consumer, not the source of truth, so 5.2's rule engine can subscribe
  directly without going through a socket.
- Events are buffered in a ring buffer (configurable, default 5 000 per
  session) so late subscribers and 5.4's timeline can backfill.
- No persistence in this step — durable run logs come with 5.4.

## Acceptance criteria

- [ ] `DeviceEvent` union and `InstrumentAction` interfaces live in
      `@lxi-web/core` so both server and web can share types.
- [ ] Every current façade (scope, PSU, DMM) publishes at least the event
      kinds listed above; polling-based sources no longer duplicate work
      between the bus and ad-hoc component state.
- [ ] Action catalog covers the listed actions for all three device kinds and
      validates input via JSON schema at the REST layer.
- [ ] WebSocket subscribers can filter by `sessionIds` and `kinds`; unfiltered
      subscribers see everything and may be rate-limited.
- [ ] Ring buffer backfill: reconnecting clients receive the last N events
      per subscribed session without gaps (checked via the monotonic `seq`).
- [ ] Unit tests cover event emission, action input validation, and
      subscription filtering. Integration test drives a fake PSU/scope pair
      through the bus end-to-end.

## Notes

- Deliberately **not** a generic pub/sub framework — events are a small
  closed enum so the UI can render them meaningfully without plugin code.
- The catalog's `common.raw` action exists because otherwise 5.2/5.3 can't
  reach exotic vendor commands; it stays gated behind the existing raw-SCPI
  warnings from 2.4.
- Waveform payloads travel on the existing scope REST route, not the event
  bus, to avoid WebSocket back-pressure on a dashboard with many sessions.
