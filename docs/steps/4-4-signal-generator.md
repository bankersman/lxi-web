# 4.4 — Instrument kind: signal / function / arbitrary waveform generator

## Goal

Add the **signal generator** device kind (covering function, arbitrary, and
dual-channel waveform generators under one facade): `ISignalGenerator` in
`@lxi-web/core`, registry wiring, simulator personality, REST + WebSocket,
and dashboard + detail UI. Ship a concrete Rigol **DG900 / DG800** driver as
the first implementation and reserve Siglent SDG + Keysight 33500B
personalities in the 4.1 simulator so the matching drivers in 4.6 / 4.7 drop
in without re-plumbing.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (additional device kinds).
- Related:
  - [1-3-typed-facades.md](1-3-typed-facades.md) — facade philosophy.
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator target.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern (DG900 family has 2 / 4-channel variants, different max frequency tiers).
  - [4-3-electronic-load.md](4-3-electronic-load.md) / [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md) — sibling new-kind steps.

## Acceptance criteria

- [ ] **`ISignalGenerator` facade** in `packages/core/src/facades/signal-generator.ts`:
  - Core per channel: `getChannelState(n)`, `setChannelEnabled(n, enabled)`, `setWaveform(n, config)`, `setOutputImpedance(n, mode)` where mode is `"50ohm" | "highZ"`.
  - Waveform config is a **discriminated union** keyed by waveform type: `sine`, `square`, `ramp`, `pulse`, `noise`, `dc`, `arbitrary`. Shared shape `{ frequencyHz, amplitudeVpp, offsetV, phaseDeg? }` plus per-type extras (square → `dutyPct`, pulse → `widthS` / `riseTimeS`, arbitrary → `builtinName | sampleId`).
  - Capability objects (advertise on driver, UI gates on presence):
    - `channels` — `{ count, frequencyMaxHz, amplitudeRangeVpp, offsetRangeV, outputImpedanceModes }` per channel.
    - `modulation` — AM / FM / PM / PWM / FSK / ASK / PSK with per-type depth, modulating source, waveform.
    - `sweep` — linear / log, start / stop / time, spacing, trigger source.
    - `burst` — gated / triggered / N-cycle with count + period + trigger.
    - `arbitrary` — `{ maxSamples, builtin, upload(samples) }` for arbitrary waveform upload (IEEE definite-length block).
    - `sync` — CH1 ↔ CH2 phase align, common-clock enable.
    - `presets` — shared `InstrumentPresetCapability`.
  - Measurement: `getChannelStatus(n)` returns actual-applied frequency / amplitude / offset so the UI can show clipped values if the instrument rounded a setpoint.
- [ ] **DeviceKind** enum grows `signalGenerator` value; icon (Lucide — `audio-waveform` or `waves`, pick one).
- [ ] **Rigol DG900 driver** (`packages/core/src/drivers/rigol/dg900.ts`) implementing the core facade plus `modulation`, `sweep`, `burst`, `arbitrary`, `sync`, `presets`.
  - Profile-driven variants: DG811 (1 ch / 10 MHz), DG812 (2 ch / 10 MHz), DG821 (1 ch / 25 MHz), DG822 (2 ch / 25 MHz), DG831 (1 ch / 35 MHz), DG832 (2 ch / 35 MHz); DG900 range similar with higher ceilings.
  - Regex `/^DG8\d{2}/i` for DG800; `/^DG9\d{2}/i` for DG900; shared class, different variant tables.
- [ ] **Simulator personalities** in 4.1: `rigol-dg812`, `rigol-dg932`, `siglent-sdg2042x`, `keysight-33511b` (the 33511B is a common entry-point in the 33500B family). Handlers simulate setpoint clamp + echo; arbitrary upload stores samples per channel so round-trip works.
- [ ] **Server**: route group `/api/sessions/:id/sg/*`. Routes:
  - `GET  /sg/channels` — all channels with current waveform config + measured actual setpoints.
  - `POST /sg/channels/:ch/enabled`, `POST /sg/channels/:ch/waveform`, `POST /sg/channels/:ch/impedance`.
  - Capability-gated: `GET/POST /sg/channels/:ch/modulation`, `.../sweep`, `.../burst`, `POST /sg/channels/:ch/arbitrary/upload`, `GET/POST /sg/sync`, `GET/POST /sg/presets`.
- [ ] **WebSocket**: `sg.channels` reading topic (enabled + waveform type + frequency + amplitude + offset + modulation summary per channel).
- [ ] **Dashboard card**: per-channel pill (A: 1 kHz sine 5 Vpp, Output ON) + enable toggle for each channel.
- [ ] **Detail page**:
  - Hero: per-channel status strip with large frequency / amplitude readouts.
  - Primary form: waveform-type selector + parameter fields (using the discriminated union for type-safe subforms).
  - Capability tabs: Modulation, Sweep, Burst, Arbitrary (upload + builtin picker + preview on a small uPlot), Sync, Presets.
  - Raw SCPI escape hatch per 2.4.
- [ ] **Tests**: facade union type coverage test (every waveform variant round-trips through REST), registry tests per variant, server integration against simulator, web component tests for the discriminated-union form.
- [ ] **Docs**: `docs/user/signal-generator.md` added; linked from user-manual index + Pages sidebar.

## Notes

- Arbitrary waveform upload uses IEEE 488.2 definite-length binary blocks; the framework already carries `queryBinary` and will need a matching `writeBinary` helper (one-time add in `ScpiSession`).
- Modulation + sweep + burst are mutually exclusive on most hardware — the facade **does not** enforce that; the driver returns instrument errors into the error queue and the UI surfaces them (gives us a single source of truth and avoids parroting per-vendor rules).
- Some vendors (notably Keysight 33500B) distinguish "legacy instrument" mode from "arbitrary sequence" mode. Keep the facade focused on setpoint-style control; sequence mode can be a later capability object.
- `outputImpedance` is always a user-visible setting because getting it wrong doubles or halves every displayed amplitude — label the control clearly.
- The simulator handlers for DG900 should echo clipped values so the UI's "actual vs. requested" display path is exercised without a real instrument.
- AWG support is deliberately **one facade across FG + AWG + multi-channel function gen**. Further specialization (e.g. a separate `IArbitraryWaveformGenerator` for very deep memory / sequencing instruments) is backlog — flag any such split as "when it hurts to share, split."
