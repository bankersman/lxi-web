# 4.5 — Instrument kind: spectrum analyzer

## Goal

Add the **spectrum analyzer** device kind: `ISpectrumAnalyzer` facade in
`@lxi-web/core`, registry, simulator personality, REST + WebSocket, and
dashboard + detail UI with a live trace plot. Ship the first driver against
**Siglent SSA3000X Plus / SSA3000X-R** as the primary target (Siglent's SA
line is widely deployed at small labs and has clean LXI + SCPI); reserve a
Rigol **RSA3000** and Keysight **N9000 / N9320** personality in the 4.1
simulator so follow-on drivers in 4.6 / 4.7 drop in without facade churn.

This is the most SCPI-surface-heavy of the three new-kind steps — scope it
tightly on the first pass. Marker math, channel-power measurements, and
modulation-analysis personalities are follow-ups.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (additional device kinds).
- Related:
  - [1-3-typed-facades.md](1-3-typed-facades.md) — facade philosophy.
  - [2-7b-scope-analysis.md](2-7b-scope-analysis.md) — measurement + marker patterns we reuse.
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator target (trace generation).
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern for SSA3000X tier variants.
  - [4-3-electronic-load.md](4-3-electronic-load.md) / [4-4-signal-generator.md](4-4-signal-generator.md) — sibling new-kind steps that share the pipeline.

## Acceptance criteria

- [ ] **`ISpectrumAnalyzer` facade** in `packages/core/src/facades/spectrum-analyzer.ts`:
  - Core: `getFrequency()` / `setFrequency({ centerHz, spanHz }) | setFrequency({ startHz, stopHz })` (discriminated input), `getReferenceLevel()` / `setReferenceLevel(dBm)`, `getBandwidth()` / `setBandwidth({ rbwHz, vbwHz, auto? })`, `getSweep()` / `setSweep({ pointsN, timeMs, continuous })`, `singleSweep()`, `readTrace(trace)` returning frequency + power arrays + metadata (units, timestamp).
  - Trace capability: `{ traceCount, modes: ["clearWrite","maxHold","minHold","average","view"], detectors: ["peak","sample","rms","negPeak","average"] }`.
  - Input capability: `{ attenuationRangeDb, preamp: { available, freqRangeHz }, inputImpedance }`.
  - Marker capability: `{ count, types: ["normal","delta","peak","band"] }`. Core API: `setMarker(id, { enabled, frequencyHz, type, reference? })`, `readMarker(id)` returning amplitude / frequency / delta vs reference.
  - Optional capabilities:
    - `channelPower` — channel-power / ACPR measurement with integration bandwidth + channel spacing.
    - `trigger` — free-run / video / external / IF / FMT trigger with level + slope.
    - `limitLines` — upload / toggle / pass-fail.
    - `averaging` — trace averaging count + mode (log-power / power / voltage).
    - `presets` — shared `InstrumentPresetCapability`.
  - Trace download uses IEEE definite-length binary blocks to keep latency bearable for `pointsN >= 751`.
- [ ] **DeviceKind** enum grows `spectrumAnalyzer`; icon (Lucide — `activity` or `signal`, pick one).
- [ ] **Siglent SSA3000X driver** (`packages/core/src/drivers/siglent/ssa3000x.ts`) implementing the core facade + markers + `averaging` + `trigger` + `presets`.
  - Profile-driven variants: SSA3015X-R (1.5 GHz), SSA3021X-R (2.1 GHz), SSA3032X-R (3.2 GHz), SSA3050X-R (5 GHz); profile differs in frequency ceiling, preamp range, tracking-generator availability.
  - Regex `/^SSA30\d{2}X(-R)?/i`; catch-all `/^SSA3\d{3}X/i` with conservative defaults.
- [ ] **Simulator personalities** in 4.1:
  - `siglent-ssa3032x` — synthetic trace generator: configurable noise floor, N injectable CW tones with amplitude / frequency, peak-hold accumulation. Returns an IEEE block of 751 points that matches the selected frequency range.
  - `rigol-rsa3030` and `keysight-n9320` stubs reserving the IDN space for downstream drivers.
- [ ] **Server**: route group `/api/sessions/:id/sa/*`. Routes:
  - `GET  /sa/frequency`, `POST /sa/frequency`, `GET/POST /sa/reference-level`, `GET/POST /sa/bandwidth`, `GET/POST /sa/sweep`, `POST /sa/sweep/single`.
  - `GET  /sa/trace/:id` — returns frequency + power arrays (JSON or binary octet stream for large N).
  - `GET/POST /sa/traces/:id/config` — mode + detector.
  - `GET  /sa/markers`, `GET/POST /sa/markers/:id`.
  - Capability-gated: `GET/POST /sa/channel-power`, `GET/POST /sa/trigger`, `GET/POST /sa/limit-lines`, `GET/POST /sa/averaging`, `GET/POST /sa/presets`.
- [ ] **WebSocket**: `sa.sweep` topic (scheduler rate ≈ 2 Hz by default, adjustable) delivers the latest trace + marker readouts. Rate-limited so an 8001-point sweep doesn't saturate the WS.
- [ ] **Dashboard card**: compact last-sweep sparkline with center-frequency + span label + marker-1 readout.
- [ ] **Detail page**:
  - Hero: large uPlot trace view with frequency (log or linear X) + dBm (linear Y), trace overlays (up to `traceCount`), markers drawn as labelled pins.
  - Side column tabs: Frequency / Bandwidth / Sweep (primary), Traces (mode + detector + averaging), Markers, Channel Power, Trigger, Limit Lines, Presets.
  - CSV export for the current trace + markers, per 2.4 accessibility rules.
- [ ] **Tests**: facade discriminated-input type tests (center/span vs start/stop), registry tests per variant, server integration against the Siglent simulator (inject tones, assert marker readouts), web component tests for the uPlot trace + marker pins.
- [ ] **Docs**: `docs/user/spectrum-analyzer.md` added; linked from user-manual index and Pages sidebar. Note explicitly which features are preview-driver-only vs hardware-verified (per 4.9 matrix rules).

## Notes

- Spectrum analyzers have the **most variable SCPI dialect** of any kind we've shipped — even within Siglent the SSA3000 vs SSA5000 command trees differ. Stick to the SSA3000X dialect for the first driver; the SSA5000A is a follow-up.
- Averaging + trace modes interact in non-obvious ways on real hardware ("max-hold with averaging = 16" is nonsensical). The facade **does not** enforce compatibility; surface instrument errors through `SYST:ERR?` into the UI, following the scope pattern.
- Fetching very deep sweeps (`pointsN ≥ 8001` on some Rigol RSA) is SCPI-slow; cap the WS scheduler rate so it never queues more than one outstanding sweep query per session.
- Channel-power measurement is surprisingly common for small-lab users testing amplifiers; include it as an optional capability even on the first driver if the vendor supports it (Siglent SSA does). Mark it preview until hardware-verified per 4.9.
- Tracking generator (TG) output on SSA3000X-R is a full sub-capability in its own right. **Defer** TG to a follow-up step; declare in the step that it is out of scope.
- Modulation analysis / EVM / spectrogram waterfall are all explicitly out of scope — each is a project-sized addition and should be its own backlog entry.
