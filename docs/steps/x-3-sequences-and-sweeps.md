# X.3 — Sequences and parameter sweeps

> **Status:** Deferred to Epic X (cross-device orchestration).

## Goal

Author and run **scripted, imperative multi-device flows** — the canonical
example is "sweep PSU CH1 from 0 V to 5 V in 0.1 V steps; at each step settle
200 ms, read DMM, single-capture the scope, collect waveform" — without
dropping into raw SCPI or a console.

Rules (X.2) are reactive ("when X, do Y"); sequences are imperative
("do this, then this, then this"). Both consume the same event bus and
action catalog from X.1.

## Scope

### Sequence model

```ts
interface Sequence {
  id: string;
  name: string;
  parameters: SequenceParameter[];     // named inputs shown in the run dialog
  steps: SequenceStep[];
}

type SequenceStep =
  | { kind: "action"; action: ActionInvocation }
  | { kind: "wait";   ms: number }
  | { kind: "waitForEvent"; match: EventMatch; timeoutMs: number }
  | { kind: "capture"; label: string; action: ActionInvocation }
  | { kind: "sweep";
      parameter: string;               // references a named parameter
      from: number; to: number; step: number;
      body: SequenceStep[] };
```

Sweeps are expanded by the runner rather than being a separate feature.
`capture` is an action whose output is recorded into the run result under
the given label (e.g. downloading a scope waveform, reading a DMM value).

### Runner

- State machine with `idle`, `running`, `paused`, `cancelling`, `finished`,
  `errored`.
- Progress events on the X.1 bus: `sequenceStarted`, `sequenceStep`,
  `sequenceCaptured`, `sequenceFinished`, `sequenceErrored`.
- Cancel / pause / resume from the REST surface; cancel aborts the current
  step gracefully (no hard `*RST`) and runs any configured cleanup steps.
- Only one sequence per backend can run at a time in v1; concurrent runs
  would need careful rule-engine interaction and are explicitly deferred.

### Results

- Each run produces a `SequenceRun` object with parameters, step outcomes,
  captured values (DMM readings, scope captures by id), and timing.
- Waveforms are stored by the scope route's existing capture-id mechanism;
  the run just references them.
- Exports: CSV (long format — one row per step × capture) and JSON (full
  structure); the X.4 timeline can replay a run chronologically.

### Persistence

- Sequences persist alongside rules in the single-user backend JSON store.
- Runs persist with a configurable retention (default: keep last 50) so the
  UI can show history without unbounded disk growth.

### REST surface

- `GET  /api/sequences` / `POST /api/sequences` / `PATCH /api/sequences/:id`
  / `DELETE /api/sequences/:id`.
- `POST /api/sequences/:id/runs` — body carries parameter values; returns
  a `runId`.
- `POST /api/sequences/runs/:runId/cancel` / `/pause` / `/resume`.
- `GET  /api/sequences/runs/:runId` — status + results (with waveform refs).
- `GET  /api/sequences/runs/:runId/export?format=csv|json`.

### UI

- New **Sequences** page linked from the header:
  - Left: saved sequences list with Run / Edit / Duplicate.
  - Right: step editor — a vertical list of typed step cards (action,
    wait, waitForEvent, capture, sweep). Each card uses the same action /
    event pickers as the rule editor.
  - Run modal: collects parameter values, shows a live progress bar with a
    per-step log and captured values, and exposes Cancel / Pause.
  - Results page per run: parameter summary, table of captured values,
    waveform thumbnails with click-through to the scope detail view,
    Export buttons.

## Acceptance criteria

- [ ] Sequence CRUD validates step kinds, action ids, and parameter
      references; unresolved references return 400 with a pointer to the
      offending step index.
- [ ] Runner executes `action`, `wait`, `waitForEvent`, `capture`, and
      `sweep` steps and surfaces per-step progress events on the bus.
- [ ] Cancel mid-sweep stops the running action, runs any configured
      cleanup, and leaves the run in `cancelled` status.
- [ ] Pause/resume keeps the instrument state untouched while paused (no
      background polling actions introduced).
- [ ] `waitForEvent` honours `timeoutMs` and reports a clear timeout error.
- [ ] Run results include captured values with labels, timestamps, and
      references to any waveform captures.
- [ ] CSV and JSON exports round-trip through a parser in tests.
- [ ] Only one run at a time — starting a second while one is active
      returns 409 with the active run's id.

## Notes

- `sweep` is deliberately a first-class step rather than "write a for-loop"
  because (a) the common case is linear, (b) it lets the UI render it with
  a range slider, and (c) non-linear sequences can always be hand-listed.
- Sequence steps cannot invoke safety-flagged actions on other sessions
  without passing the same interlock-safety confirmation rule engine does
  (prevents foot-guns like "sweep PSU with OVP off").
- Sequences are designed to integrate with X.4: a run's timeline view is
  just the X.4 timeline scoped to the run window with step markers.
