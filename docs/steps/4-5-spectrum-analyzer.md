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

- [x] **`ISpectrumAnalyzer` facade** in `packages/core/src/facades/spectrum-analyzer.ts`:
  - Core: `getFrequency()` / `setFrequency({ centerHz, spanHz }) | setFrequency({ startHz, stopHz })` (discriminated input), `getReferenceLevel()` / `setReferenceLevel(dBm)`, `getBandwidth()` / `setBandwidth({ rbwHz, vbwHz, auto? })`, `getSweep()` / `setSweep({ pointsN, timeMs, continuous })`, `singleSweep()`, `readTrace(trace)` returning frequency + power arrays + metadata (units, timestamp).
  - Trace capability: `{ traceCount, modes: ["clearWrite","maxHold","minHold","average","view"], detectors: ["peak","sample","rms","negPeak","average"] }`.
  - Input capability: `{ attenuationRangeDb, preamp: { available, freqRangeHz }, inputImpedance }`.
  - Marker capability: `{ count, types: ["normal","delta","peak","band"] }`. Core API: `setMarker(id, { enabled, frequencyHz, type, reference? })`, `readMarker(id)` returning amplitude / frequency / delta vs reference. `peakSearch(id)` added as an optional convenience.
  - Optional capabilities:
    - `channelPower` — channel-power / ACPR measurement with integration bandwidth + channel spacing.
    - `trigger` — free-run / video / external / IF / FMT trigger with level + slope.
    - `limitLines` — upload / toggle / pass-fail.
    - `averaging` — trace averaging count + mode (log-power / power / voltage).
    - `presets` — shared `InstrumentPresetCapability`.
  - Trace transfer uses CSV on the TCP path today (Siglent firmware returns `TRAC:DATA?` as ASCII); the facade stays binary-ready via `queryBinary` for future drivers.
- [x] **DeviceKind** enum grows `spectrumAnalyzer`; dashboard icon uses Lucide `Radio`.
- [x] **Siglent SSA3000X driver** (`packages/core/src/drivers/siglent/ssa3000x.ts`) implementing the core facade + markers + `averaging` + `trigger` + `limitLines` + `presets` + channel-power.
  - Profile-driven variants: SSA3015X / SSA3015X-R (1.5 GHz), SSA3021X / SSA3021X-R (2.1 GHz), SSA3032X / SSA3032X-R (3.2 GHz), SSA3050X / SSA3050X-R (5 GHz); profile differs in frequency ceiling, preamp range, tracking-generator availability.
  - Regex: one entry per variant (`^SSA3032X-R\\b`, etc.) plus catch-all `/^SSA3\d{3}X(?:-R)?/i` that instantiates the driver with the conservative 3.2 GHz default profile.
  - Tracking generator is advertised via `profile.hasTrackingGenerator`; the driver exposes it read-only for now (dedicated TG sub-capability is a follow-up).
- [x] **Simulator personalities** in 4.1:
  - `siglent-ssa3032x` — round-trips center / span / reference level / RBW / VBW / sweep points / attenuation / preamp / continuous / trace mode + detector / markers / channel power / trigger / averaging. `TRAC:DATA?` returns a synthetic CSV trace (-20 dB skirt around center, 1.5 dB jitter) keyed by the configured span + center + reference level; peak searches snap M1 to `-10.5 dBm` as a canned result.
  - `rigol-rsa3030` and `keysight-n9320b` — placeholder personalities that answer `*IDN?` + `*OPT?` and park an empty error queue, reserving IDN regexes so 4.6 / 4.7 vendor-pack drivers drop in without facade churn. Full-fat simulators follow those epics.
- [x] **Server**: route group `/api/sessions/:id/sa/*` registered through `registerSaRoutes` in `packages/server/src/routes/sa.ts`. Routes:
  - `GET /sa/state` returns frequency + reference + bandwidth + sweep + input + capability bundle in one payload (collapses five chatty endpoints into one call for the UI).
  - `POST /sa/frequency`, `/sa/reference-level`, `/sa/bandwidth`, `/sa/sweep`, `/sa/single-sweep`, `/sa/input`.
  - `GET/POST /sa/traces/:trace` — mode + detector + enable; `GET /sa/traces/:trace/data` — JSON trace (frequency + amplitude arrays).
  - `GET /sa/markers`, `POST /sa/markers/:marker`, `POST /sa/markers/:marker/peak-search`.
  - Capability-gated: `GET/POST /sa/channel-power` + `GET /sa/channel-power/reading`, `GET/POST /sa/trigger`, `GET /sa/limit-lines` + `POST/DELETE`, `GET/POST /sa/averaging`, `GET/POST /sa/presets/:slot/save|recall`.
- [x] **WebSocket**: `sa.trace` (2 s tick) and `sa.markers` (1.5 s tick) topics wired into the reading scheduler. Trace payload carries plain number arrays matched on `(frequencyHz, amplitude)`; kept single-trace for the first pass — multi-trace fan-out is a follow-up.
- [x] **Dashboard card**: `SaMiniPanel.vue` renders a compact sparkline of the latest trace and shows peak + M1 readouts using the live `sa.trace` / `sa.markers` topics.
- [x] **Detail page**: `SaPanel.vue` with:
  - Hero: large inline SVG trace view with automatic Y-axis min/max labels and peak readout.
  - Control grid: Frequency (center + span), Reference & resolution (ref level + RBW), Sweep (points + continuous status), Markers (active marker table with peak-search action).
  - `Single sweep` + `Peak search` buttons.
  - uPlot + tabbed side column (traces / bands / limit lines / averaging controls) are deferred to a follow-up that brings the shared chart toolkit in line with the scope's uPlot wiring.
- [x] **Tests**:
  - Core: `packages/core/test/sa.test.ts` covers capability advertisement, frequency + reference-level SCPI emission, range validation, CSV trace decoding, marker round-trip, preamp capability gating, and registry resolution (variant + fall-through).
  - Server: `packages/server/test/http.test.ts` adds state snapshot, frequency validation, trace JSON, and 409 rejection tests.
  - Simulator integration: `packages/sim/test/integration.test.ts` connects to the SSA3032X personality, round-trips frequency + ref level + sweep points, reads back a trace, and asserts the 10 GHz request is refused by the driver profile.
- [x] **Docs**: `docs/user/spectrum-analyzer.md` added, linked from the user manual index and VitePress sidebar; step document updated; progress.md bumped.

## Notes

- Spectrum analyzers have the **most variable SCPI dialect** of any kind we've shipped — even within Siglent the SSA3000 vs SSA5000 command trees differ. Stick to the SSA3000X dialect for the first driver; the SSA5000A is a follow-up.
- Averaging + trace modes interact in non-obvious ways on real hardware ("max-hold with averaging = 16" is nonsensical). The facade **does not** enforce compatibility; surface instrument errors through `SYST:ERR?` into the UI, following the scope pattern.
- Fetching very deep sweeps (`pointsN ≥ 8001` on some Rigol RSA) is SCPI-slow; cap the WS scheduler rate so it never queues more than one outstanding sweep query per session.
- Channel-power measurement is surprisingly common for small-lab users testing amplifiers; include it as an optional capability even on the first driver if the vendor supports it (Siglent SSA does). Mark it preview until hardware-verified per 4.9.
- Tracking generator (TG) output on SSA3000X-R is a full sub-capability in its own right. **Defer** TG to a follow-up step; declare in the step that it is out of scope.
- Modulation analysis / EVM / spectrogram waterfall are all explicitly out of scope — each is a project-sized addition and should be its own backlog entry.
