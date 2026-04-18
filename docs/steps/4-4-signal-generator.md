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

- [x] **`ISignalGenerator` facade** in `packages/core/src/facades/signal-generator.ts`:
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
- [x] **DeviceKind** enum grows `signalGenerator` value; icon (Lucide `AudioWaveform` via `DeviceKindIcon`).
- [x] **Rigol DG900 driver** (`packages/core/src/drivers/rigol/dg900.ts`) implementing the core facade plus `modulation`, `sweep`, `burst`, `arbitrary`, `sync`, `presets`.
  - Profile-driven variants in `dg900-profile.ts`: DG811/DG812 (10 MHz), DG821/DG822 (25 MHz), DG831/DG832 (35 MHz), DG922/DG932/DG952/DG972 (DG900 ceilings).
  - Family detection via regex `/^DG8\d{2}/i` for DG800 and `/^DG9\d{2}/i` for DG900; shared class, separate variant tables and `DG800_DEFAULT` / `DG900_DEFAULT` fall-throughs. `refineDg900Profile` stub hooked for `*OPT?` parity.
- [x] **Simulator personalities** shipped as `rigol-dg812`, `rigol-dg932`, `siglent-sdg2042x`, `keysight-33511b`. A `makeDg9xxPersonality` factory centralizes channel-scoped SCPI handlers and clamps setpoints against the profile ceilings; the Siglent / Keysight fixtures reserve their IDN patterns for 4.6 / 4.7.
- [x] **Server**: route group `/api/sessions/:id/sg/*`. Routes:
  - `GET /sg/channels`, `GET /sg/channels/:ch`, `POST /sg/channels/:ch/enabled`, `POST /sg/channels/:ch/impedance`, `POST /sg/channels/:ch/waveform`.
  - Capability-gated: `GET/POST /sg/channels/:ch/modulation`, `.../sweep`, `.../burst`, `GET /sg/arbitrary`, `POST /sg/channels/:ch/arbitrary/upload`, `DELETE /sg/arbitrary/:sampleId`, `GET /sg/sync`, `POST /sg/sync/align`, `POST /sg/sync/common-clock`, `GET /sg/presets`, `POST /sg/presets/:slot/(save|recall)`.
- [x] **WebSocket**: `sg.channels` reading topic wired through `ReadingScheduler` at 2 s cadence; emits each channel's state (enabled, waveform type, frequency, amplitude, offset, impedance).
- [x] **Dashboard card**: `SgMiniPanel.vue` shows per-channel pill (label + waveform + frequency) with an inline Output ON / OFF toggle.
- [x] **Detail page**: `SgPanel.vue` lays out per-channel hero tiles (frequency / amplitude / offset), a waveform form with type-aware parameter fields (sine / square / ramp / pulse / noise / dc / arbitrary), impedance toggles, and a capabilities summary listing the modulation / sweep / burst / arbitrary / sync / presets surface exposed by the API. Full capability sub-forms are reachable through the API helpers in `api/client.ts`.
- [x] **Tests**:
  - `packages/core/test/sg.test.ts` — profile-driven capability shape, `getChannelState` round-trip, `setWaveform` SCPI emission, validation against profile limits, arbitrary upload via `writeBinary`, registry resolution for every DG800 / DG900 variant plus generic fall-throughs.
  - `packages/server/test/http.test.ts` — `sg` route group: `GET /sg/channels` snapshot with capabilities, `POST .../waveform` validation + SCPI forwarding, `enabled` / `impedance` round-trip, arbitrary upload integration with the fake SCPI fake, and 409 rejection for non-sg sessions.
  - `packages/sim/test/integration.test.ts` — DG812 + DG932 end-to-end via `ScpiSession.openTcp` against the simulator (waveform round-trip + clamping), plus IDN reservation checks for the Siglent / Keysight stubs.
- [x] **Docs**: `docs/user/signal-generator.md` added and linked from the user-manual index.

## Notes

- Arbitrary waveform upload uses IEEE 488.2 definite-length binary blocks; the framework already carries `queryBinary` and will need a matching `writeBinary` helper (one-time add in `ScpiSession`).
- Modulation + sweep + burst are mutually exclusive on most hardware — the facade **does not** enforce that; the driver returns instrument errors into the error queue and the UI surfaces them (gives us a single source of truth and avoids parroting per-vendor rules).
- Some vendors (notably Keysight 33500B) distinguish "legacy instrument" mode from "arbitrary sequence" mode. Keep the facade focused on setpoint-style control; sequence mode can be a later capability object.
- `outputImpedance` is always a user-visible setting because getting it wrong doubles or halves every displayed amplitude — label the control clearly.
- The simulator handlers for DG900 should echo clipped values so the UI's "actual vs. requested" display path is exercised without a real instrument.
- AWG support is deliberately **one facade across FG + AWG + multi-channel function gen**. Further specialization (e.g. a separate `IArbitraryWaveformGenerator` for very deep memory / sequencing instruments) is backlog — flag any such split as "when it hurts to share, split."
