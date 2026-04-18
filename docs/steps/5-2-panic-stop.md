# 5.2 — Panic stop: disable all outputs

## Goal

A single, always-reachable, big red **"All outputs off"** button that
immediately disables every output-bearing channel on every connected
instrument. For a bench tool this is the analogue of the physical emergency
stop on rack gear: when a DUT is smoking, the operator should not need to
navigate between detail pages to turn three PSUs off individually.

Not a configurable safety rule. Not a programmable interlock. Not part
of the Epic X orchestration layer. Just a primitive, unambiguous,
always-present kill switch that every driver opts into.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 5 (bench safety).
- Related:
  - [2-5-psu-advanced-features.md](2-5-psu-advanced-features.md) — PSU `setEnabled` on `IPowerSupply`.
  - [4-3-electronic-load.md](4-3-electronic-load.md) — e-load `setEnabled` on `IElectronicLoad`.
  - [4-4-signal-generator.md](4-4-signal-generator.md) — SG per-channel output enable.
  - [5-1-scpi-observability.md](5-1-scpi-observability.md) — transcript records every panic invocation.

## Scope

### Capability shape

New optional common capability on every façade:

```ts
interface IOutputKillable {
  /** Disable every output-capable path this instrument exposes. */
  disableAllOutputs(): Promise<OutputKillResult>;
}

interface OutputKillResult {
  kind: "ok" | "partial" | "error";
  touched: string[];   // descriptors like "CH1", "CH2", "Track mode"
  errors?: Array<{ target: string; message: string }>;
}
```

Every driver that owns outputs implements it:

- **PSU (`IPowerSupply`):** iterate channels, call `setEnabled(false)`
  on each; if coupling/tracking is active, disable those too. Return
  `ok` only if every channel reports disabled.
- **Electronic load (`IElectronicLoad`):** `setEnabled(false)` on the
  input channel.
- **Signal generator (`ISignalGenerator`):** iterate channels, disable
  each. (An AWG with its output on can still be a safety issue —
  DUT inputs may not like a 10 V sine wave.)
- **Scope / DMM / SA / unknown:** no-op; no output. Capability absent.

### Backend

- New `POST /api/panic` endpoint (server-wide, not per-session).
- Iterates every active session, calls `disableAllOutputs()` on every
  session whose façade advertises `IOutputKillable`, **in parallel**
  with a short per-instrument timeout (default 500 ms).
- Returns a structured response:
  ```ts
  interface PanicResult {
    startedAt: string;
    finishedAt: string;
    touchedSessions: Array<{
      sessionId: string;
      idn: string;
      outcome: OutputKillResult;
      elapsedMs: number;
    }>;
    skippedSessions: Array<{ sessionId: string; reason: string }>;
  }
  ```
- Emits a `session.event` frame with kind `panicStop` for every session
  touched (forward-compatible with Epic X.1's event bus — the frame
  payload matches what that step will publish).
- Records a `TranscriptEntry` with `origin: { kind: "panic" }` on every
  touched session so 5.1's transcript shows exactly what hit the wire.
- Panic invocations are themselves ring-buffered on `SessionManager`
  (last 20) for the history pane described below.

### UI

- **Persistent header button.** Always visible, never disabled, never
  hidden behind a menu. Red background, white text, large target
  (min 44 × 44 CSS px). Accessible name "Panic stop: disable all
  outputs".
- **Two-step confirm on first use per browser session.** First click
  opens a tiny inline confirm (`"Disable all outputs on N instruments?"`
  + Confirm / Cancel), focus locked to Confirm. Subsequent clicks in
  the same browser session go through single-click — muscle memory is
  what matters when it's urgent. Confirm is bypassed entirely if the
  user enables **"Always single-click panic"** in settings.
- Keyboard shortcut: `Ctrl+Shift+.` (matches `Esc`-alike muscle memory
  without clashing with browser defaults). Documented in 6.1.
- After firing: toast summarising result — "All outputs off (3
  instruments, 12 ms)". On partial / error outcomes, the toast expands
  to list per-instrument failures with a **Retry** action.
- **Panic history** panel on the dashboard (collapsible, compact):
  table of recent panic invocations with timestamp, outcome, and a
  link to each touched session's transcript filtered to
  `origin.kind === "panic"`. Persisted across backend restart is not
  required.

### Safety semantics

- Panic never issues `*RST`. It is minimally invasive: set output
  enables to `false` and nothing else. Display / capture / math state
  is preserved so the operator can inspect what happened.
- Panic does **not** disconnect the TCP sessions. A panicked bench is
  still observable.
- Panic is idempotent: calling it on an already-off bench is a safe
  no-op that still updates the history panel.
- If a session is in `error` state (3.2) when panic fires, it is
  listed in `skippedSessions` with reason `"session-not-connected"`;
  panic does not try to reconnect it.

## Acceptance criteria

- [ ] `IOutputKillable` capability shape lands on `@lxi-web/core` and
      is implemented by `IPowerSupply` / `IElectronicLoad` /
      `ISignalGenerator` façades (as optional capability on each).
- [ ] Every shipped driver that owns outputs (Rigol DP900 / DL3000 /
      DG900; Siglent SPD / SDL / SDG; Keysight E36 / EL3 / 33500B; any
      others from 4.10–4.13) implements `disableAllOutputs()`.
- [ ] `POST /api/panic` iterates sessions in parallel, honours the
      per-instrument timeout, and returns the structured `PanicResult`.
- [ ] Panic emits a `session.event` frame with kind `panicStop` per
      touched session (payload shape fixed so Epic X.1 can consume it
      without churn).
- [ ] Panic invocations write transcript entries with
      `origin: { kind: "panic" }` (5.1 integration).
- [ ] Header button is keyboard-reachable, meets contrast requirements,
      and never hides behind responsive breakpoints.
- [ ] First-click confirm ships and can be disabled per browser with a
      persistent setting; subsequent clicks are single-click by default.
- [ ] Keyboard shortcut `Ctrl+Shift+.` fires the button (after 6.1
      lands) and is documented in the help overlay.
- [ ] Partial-success and full-failure outcomes render with per-session
      detail and a Retry action.
- [ ] Panic history panel lists the last 20 invocations with links to
      the transcript of each touched session.
- [ ] End-to-end test: backend headless with 3 simulated PSUs, call
      `/api/panic`, assert every simulator received the corresponding
      output-off command and `PanicResult.touchedSessions.length === 3`.
- [ ] Integration test: driver missing `IOutputKillable` → skipped with
      correct reason; session in `error` state → skipped with correct
      reason.

## Notes

- The panic button deliberately lives outside Epic X's rule engine. A
  rule-based interlock requires the backend to believe a condition is
  true; the panic button works even if the sensors lie. Treat it as
  hardware-emergency-stop-equivalent, not as an interlock.
- Signal generators are included because an AWG driving a DUT input can
  cause real damage. If a user disagrees, they can uncheck per-kind
  opt-out in settings (keep behind a flag; default = opt all kinds in).
- PSU channel coupling / tracking: disabling the master should cascade
  to the slaves through the driver's existing plumbing. Verify per
  driver; for R&S NGP / Keysight E36300 where coupling is explicit,
  driver `disableAllOutputs` also writes coupling-off first to avoid
  paired re-enables.
- Transcript tag `origin.kind = "panic"` is a filterable origin kind
  introduced in 5.1; this step formalises the tag.
