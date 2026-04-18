# X.4 — Correlated timeline and multi-device export

> **Status:** Deferred to Epic X (cross-device orchestration).

## Goal

Show what happened across **all** connected instruments on a single time
axis — triggers, output-state changes, measurement samples, OVP/OCP trips,
rule fires, sequence steps — and export the same data for offline analysis.

This is the "why did my board reset?" view: scroll a window, see the DMM
spike and the OVP trip on CH1 and the scope trigger line up, then hand
someone a CSV.

## Scope

### Recording

- The event bus ring buffer (X.1) is promoted to a **persistent run log**
  when any of the following is active:
  - A sequence run (X.3) is in progress.
  - One or more rules (X.2) are tagged "record timeline".
  - The user explicitly starts a recording from the Timeline page.
- Otherwise the in-memory ring buffer continues to serve live-view clients
  only; persistence is opt-in so idle sessions don't grow log files.
- Each recording is a `TimelineRun` with id, name, `startedAt`, `endedAt?`,
  and the set of `sessionId`s active during the window.

### Visualization

- New **Timeline** tab (route `/timeline` + `/timeline/:runId`) with:
  - Horizontal time axis scaled to the window; zoom and pan with keyboard
    and wheel; `prefers-reduced-motion` respected.
  - **Lanes per session** stacked vertically, one header row with device
    kind icon + `*IDN?` short title.
  - Within each lane: event glyphs (trigger, output change, protection
    trip), optional sparkline of measurement samples.
  - Cross-session overlays: rule fires and sequence step boundaries drawn
    across all lanes as vertical markers.
- A right-hand filter panel toggles sessions, kinds, and rule ids.
- Click an event → detail popover with raw fields and a "jump to scope
  capture" link where applicable.
- Scrubbing in replay mode (`/timeline/:runId/replay`) moves a cursor over
  the data and updates a per-session state summary panel on the side.

### Timestamps

- Every event carries both a wall-clock `timestamp` and a `seq` (from X.1).
- Sequence runs add a `runElapsedMs` so step boundaries line up even if
  wall-clock drifts between instruments.
- No attempt at IEEE 1588 PTP sync — that's in X.5's research scope.

### Export

- `GET /api/timeline/runs/:runId/export?format=csv-wide|csv-long|json|ndjson`
  - `csv-wide`: one row per timestamp with columns per session×kind (good
    for spreadsheets, lossy for bursty data).
  - `csv-long`: one row per event (lossless, recommended default).
  - `json`: full structure including waveform capture references.
  - `ndjson`: streams for large runs without loading into memory.
- Timeline data bundles a **manifest.json** describing sessions, device
  kinds, and schema version, so downstream tooling can parse without
  re-querying the backend.
- Waveform blobs stay out of CSV — they're referenced by capture id and
  can be downloaded separately from the existing scope route.

### Storage

- Runs live in a per-run directory under `~/.lxi-web/timelines/<runId>/`
  with `events.ndjson` (append-only) and `manifest.json`.
- Retention policy is configurable; default keeps the last 20 runs or
  ~500 MB, whichever is smaller.
- Runs can be pinned to exempt them from retention (UI + REST).

### REST surface

- `GET  /api/timeline/runs` — list with metadata.
- `POST /api/timeline/runs` — start a new ad-hoc recording; body selects
  sessions and optional stop condition.
- `POST /api/timeline/runs/:runId/stop`.
- `GET  /api/timeline/runs/:runId` — metadata + pagination over events.
- `GET  /api/timeline/runs/:runId/events?from=&to=&kinds=&sessionIds=` —
  filterable replay window.
- `POST /api/timeline/runs/:runId/pinned` — toggle retention exemption.
- `GET  /api/timeline/runs/:runId/export?format=…`.

## Acceptance criteria

- [ ] Event bus sinks into `events.ndjson` only while a recording is
      active; no disk writes in idle state.
- [ ] Timeline view renders at least 10 000 events over 4 sessions without
      dropping below 30 fps on the reference hardware.
- [ ] Filters by session id, kind, and rule id produce lossless subsets.
- [ ] Replay scrubbing updates per-session state summaries and the event
      selection highlight within one frame.
- [ ] `csv-long`, `json`, and `ndjson` exports round-trip through a parser
      in tests; `csv-wide` is explicitly documented as lossy.
- [ ] Sequence runs auto-create a matching timeline recording and link
      back from the run results page.
- [ ] Retention policy evicts runs correctly, skips pinned runs, and is
      covered by a deterministic unit test.

## Notes

- Ring-buffer → disk sink is the single write path; live clients still
  read from the ring buffer so they don't need to hit disk.
- No attempt to synthesize waveforms into the timeline; the scope capture
  id keeps them browsable but separate.
- Export formats are opinionated: `csv-long` is almost always what you
  actually want. `csv-wide` exists because someone will ask for it.
