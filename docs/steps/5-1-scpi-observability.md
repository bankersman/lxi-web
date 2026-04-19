# 5.1 — SCPI observability: error queue + session transcript

## Goal

Make everything an instrument actually hears and says **visible** to the
operator. Two concrete artefacts:

1. A **device-errors** surface that drains `SYST:ERR?` on a cadence and
   shows the resulting entries on the detail page and as a dashboard
   badge whenever the queue is non-empty. Today the hook exists in
   `ScpiSession` but the errors never
   reach the UI — a rejected command silently disappears, which is the
   single most common frustration with raw SCPI and any typed panel that
   pushes slightly wrong commands.
2. A **session transcript** — a per-session ring buffer capturing every
   write / query / binary-block exchange between the backend and the
   instrument, with direction, timestamp, elapsed ms, and payload.
   Surfaced as a panel on the detail page and downloadable as NDJSON.

Both ship end-to-end on all currently-supported device kinds and drivers.
They are the debugging foundation we do not have today; everything else
in Epic 5 (panic stop, safe mode) is safer and easier to reason about
once operators can see what's actually happening on the wire.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 5 (bench safety).
- Related:
  - [1-1-transport-and-scpi-core.md](1-1-transport-and-scpi-core.md) — existing `SYST:ERR?` hook in `ScpiSession`.
  - [2-2-rest-and-websocket.md](2-2-rest-and-websocket.md) — WS topic scheduler pattern.
  - [2-4-per-session-detail-views.md](2-4-per-session-detail-views.md) — raw SCPI panel that will get an adjacent Transcript tab.
  - [3-4-device-detail-ux.md](3-4-device-detail-ux.md) — overview card surface for the error pill.

## Scope

### Device-error queue drain

- New **optional** `IErrorQueue` capability on `ScpiSession`:
  ```ts
  interface IErrorQueue {
    readonly pollIntervalMs: number; // default 2000
    drain(): Promise<DeviceErrorEntry[]>;
  }
  ```
  Populated on every known driver (all Rigol / Siglent / Keysight / Owon
  families), absent on `unknown` kind — the poller skips `unknown`.
- `DeviceErrorEntry`:
  ```ts
  interface DeviceErrorEntry {
    code: number;          // e.g. -113, parsed from SYST:ERR? response
    message: string;       // e.g. "Undefined header"
    timestamp: string;     // ISO 8601 wall clock when drained
    rawLine: string;       // original SCPI response line
  }
  ```
- Backend scheduler: one loop per session, runs `drain()` on the
  advertised `pollIntervalMs` cadence, buffers entries in a ring (default
  200 per session) on `SessionManager`, and emits a `device.errors` WS
  topic frame when new entries land (batched at 250 ms).
- The poller is a **query-only** operation. Drivers are responsible for
  using the instrument's documented error-queue command — usually
  `SYST:ERR?`, occasionally `STATus:QUEue:NEXT?` or a vendor variant —
  and returning `[]` if the queue is empty.
- Entries are **not** persisted; solo-bench tool, in-memory ring is
  enough. They survive a UI reconnect because they sit on `SessionManager`.

### Session transcript

- New in-memory ring buffer on `SessionManager` (default 2000 entries per
  session, configurable via env).
- `TranscriptEntry`:
  ```ts
  interface TranscriptEntry {
    seq: number;            // monotonic per session
    timestamp: string;
    direction: "write" | "query" | "block-write" | "block-query";
    command: string;        // the SCPI text, or "<binary N bytes>" for blocks
    response?: string;      // for query / block-query only
    elapsedMs: number;
    origin:
      | { kind: "driver"; method: string }        // e.g. "setOutput"
      | { kind: "poller"; topic: string }         // e.g. "psu.channels"
      | { kind: "errorQueue" }
      | { kind: "rawScpi" }                        // user via raw SCPI panel
      | { kind: "action"; actionId: string };     // for Epic X orchestration
  }
  ```
- `ScpiSession` grows a pluggable `TranscriptSink` receiver;
  `SessionManager` wires a session-scoped sink on connect. Writes never
  block the SCPI path — the sink pushes to a lock-free bounded buffer and
  drops the oldest entries if full.
- REST: `GET /api/sessions/:id/transcript?since=<seq>&limit=<n>` — paged
  replay; default limit 200, max 2000.
- WS topic `session.transcript` — tail mode, clients subscribe to receive
  new entries as they happen, batched at 100 ms.
- NDJSON download: `GET /api/sessions/:id/transcript/export` streams the
  entire current ring.

### UI

- **Device error pill (`DeviceErrorsPill`):** only **mounts when there is at
  least one** buffered error (`count > 0`). While the queue is empty, no
  pill is shown — the layout stays unchanged and polling / `device.errors`
  subscription still runs so the pill appears as soon as an error lands.
  Click opens a popover with recent entries (code, message, wall-clock
  timestamp); **Clear buffer** calls `POST /api/sessions/:id/errors/clear`
  and removes the pill when the count returns to zero.
- **Device detail — overview card (3.4):** when errors exist, show the
  pill next to the status / reconnect controls (full label, e.g.
  **"2 device errors"**).
- **Dashboard — device grid card:** same behaviour with the `compact`
  styling flag (tighter pill height). Header row uses `min-w-0` on the card
  and title column plus `flex-wrap` on the actions cluster so the pill and
  connection status stay inside the card when multiple devices sit in a
  narrow grid column.
- Detail page: new **Transcript** tab next to Raw SCPI. Virtualised list
  with timestamp, direction glyph, origin tag, command, response (if
  any), elapsed ms; rows are **newest first** (descending `seq`) so recent
  traffic appears at the top of the scroll area. Filter bar: text search
  (substring), direction, and origin-kind checkboxes. **Pause** / **Resume**
  toggles live tail; **Download NDJSON** button uses the export endpoint.
- Raw SCPI console (2.4) auto-appends to the transcript with
  `origin: { kind: "rawScpi" }`; the Transcript tab is the canonical view
  for rich replay rather than building filters into the Raw SCPI panel.

## Backend changes

- `packages/core/src/scpi/ScpiSession.ts`: introduce `TranscriptSink`
  interface, accept via constructor options, invoke around every
  `write` / `query` / `queryIEEEBlock` / `writeBinary` with timing.
- `packages/core/src/drivers/*`: each driver exposes `errorQueue` as an
  optional capability returning an `IErrorQueue` bound to the driver's
  native error-poll command. Most families reuse a shared helper
  `drainSystErr(port)` from a new `@lxi-web/core` utility.
- `packages/server/src/sessionManager.ts`: new `TranscriptBuffer` +
  `DeviceErrorBuffer` per-session ring implementations; wire on connect;
  emit WS frames; expose REST.
- `packages/server/src/routes/transcript.ts`, `routes/errors.ts`: new
  route modules.

## Acceptance criteria

- [ ] `IErrorQueue` capability shape lands on `ScpiSession` and on every
      driver family (Rigol / Siglent / Keysight / Owon for every kind).
      `unknown` kind is explicitly opted out.
- [ ] Poller drains `SYST:ERR?` (or family-specific equivalent) on the
      advertised cadence, does not block when the instrument is busy,
      and is covered by a unit test that asserts no parser overhead when
      the queue is empty.
- [ ] New WS topic `device.errors` broadcasts entries with batched
      framing; reconnecting clients receive the full current ring via
      REST.
- [ ] Transcript ring buffer captures every SCPI exchange across every
      driver path; unit test confirms `driver method call → transcript
      entry` for each device kind's primary façade method.
- [ ] REST `GET /api/sessions/:id/transcript` supports `since=<seq>` +
      `limit` paging; NDJSON export endpoint streams without buffering
      the full ring in memory.
- [ ] WS `session.transcript` tail is throttled at 100 ms; test confirms
      no missed entries after a 1000-command burst.
- [ ] Error pill is **omitted when the buffer is empty**; it appears only
      when there is ≥ 1 device error, updates reactively, and is
      keyboard-reachable with an `aria-describedby` summary.
- [ ] Detail page Transcript tab virtualises ≥ 2000 entries without jank
      on the reference hardware; filter, pause, download work end-to-end.
- [ ] Raw SCPI inputs auto-appear in the transcript with
      `origin: { kind: "rawScpi" }`.
- [ ] No persistence introduced in this step; rings reset on backend
      restart and that is documented.

## Notes

- `SYST:ERR?` has vendor quirks: some instruments return `0,"No error"`
  on an empty queue (treat as the terminating sentinel); others return
  nothing and rely on the driver timing out the query. The shared
  `drainSystErr` helper should short-circuit on both.
- Transcript buffer size is a deliberate trade-off — 2000 × average
  ~200 byte payload = ~400 KB per session. With 8 sessions that's 3 MB
  RAM; fine for a bench app, cheap to raise if a user asks.
- Transcript is **never** written to disk in this step. If a recording
  use-case surfaces later, wire it through Epic X.4's persistent-run-log
  path rather than growing a second persistence mechanism here.
- This step unlocks two other things: (a) a better safe mode (6-…), since
  we can audit exactly which writes are happening; (b) Epic X.1's event
  bus, since the same transcript pipeline doubles as the raw event feed.
