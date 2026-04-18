# 4.3 — Instrument kind: electronic load

## Goal

Introduce the **electronic load** device kind end-to-end: a typed
`IElectronicLoad` facade in `@lxi-web/core`, a new `DeviceKind` enum value,
registry routing, simulator personality, REST + WebSocket exposure, and a
dashboard card + `/device/:sessionId` detail page. Ship a concrete Rigol
**DL3021 / DL3031** driver as the first implementation, and cover at least
one Siglent SDL personality in the 4.1 simulator so 4.6 can add the driver
without touching facade or UI plumbing.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (additional device kinds).
- Related:
  - [1-3-typed-facades.md](1-3-typed-facades.md) — facade philosophy.
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator target for hardware-free validation.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern to reuse for DL3000 family.
  - [4-4-signal-generator.md](4-4-signal-generator.md) / [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md) — sibling new-kind steps that share the pipeline.

## Acceptance criteria

- [ ] **`IElectronicLoad` facade** in `packages/core/src/facades/electronic-load.ts`:
  - Core: `getState()`, `setInputEnabled(enabled)`, `setMode(mode)`, `measure()` returning voltage / current / power / resistance.
  - Modes (required): `cc` (constant current), `cv` (constant voltage), `cr` (constant resistance), `cp` (constant power).
  - Setpoint API: `setSetpoint(mode, value)` plus `getSetpoints()` so the UI can show all four even when only one is active.
  - Channel limits capability: `{ voltageMax, currentMax, powerMax, resistanceRange }`.
  - Optional capabilities (advertise on driver; absent = UI hides the section):
    - `dynamic` — A/B setpoint pairs with slew rate + frequency for pulse loading (`:SOURce:CURRent:TRANsient`).
    - `list` — programmable list/sweep steps with trigger source.
    - `protection` — OVP / OCP / OPP / OTP enable + threshold + trip state, mirrors `PsuProtectionCapability` shape.
    - `battery` — battery-discharge mode with cutoff current / voltage / time.
    - `logging` — reuse `MultimeterLoggingCapability` shape (interval + max samples) for CSV-friendly measurement streams.
    - `presets` — reuse shared `InstrumentPresetCapability` from 2.6c.
- [ ] **DeviceKind** enum grows an `electronicLoad` value; `DEVICE_KINDS` array updated; UI icon assignment (Lucide — `plug-zap` or similar, pick one and commit).
- [ ] **Rigol DL3000 driver** (`packages/core/src/drivers/rigol/dl3000.ts`) implementing the core facade + `protection` + `battery` + `logging` + `presets` capabilities.
  - Profile-driven per 4.2 — initial variants DL3021 (150 V / 40 A / 200 W) and DL3031 (150 V / 60 A / 350 W) share the SCPI dialect; profile differs in channel limits and protection max.
  - Regex `/^DL30\d{2}/i`; catch-all entry for future DL31xx with conservative profile.
- [ ] **Simulator personality** in 4.1: `rigol-dl3021` — canned voltage drop under load, CC/CV/CR/CP setpoint echoes, protection trip simulation when setpoint exceeds profile limits. Second personality `siglent-sdl1020x-e` reserves the IDN pattern for 4.6 (handlers may be a stub initially).
- [ ] **Server**: new route group `/api/sessions/:id/eload/*`. Routes:
  - `GET  /eload/state` — enabled + mode + setpoints + measured values + protection state.
  - `POST /eload/enabled`, `POST /eload/mode`, `POST /eload/setpoint`.
  - `GET/POST /eload/protection` (gated), `GET/POST /eload/dynamic`, `GET/POST /eload/battery`, `GET/POST /eload/presets`.
  - `POST /eload/logging/start`, `POST /eload/logging/stop`, `GET /eload/logging/samples?since=<seq>`.
- [ ] **WebSocket**: new `eload.measurement` reading topic (voltage / current / power / resistance + mode + tripped flag), `eload.state` topic for enable/mode/setpoint changes. Subscribe/unsubscribe fan-out matches 2.2 pattern (one scheduler per `(sessionId, topic)`).
- [ ] **Dashboard card** (compact): mode pill, enable toggle, live V / I / P readout, trip badge if tripped.
- [ ] **Detail page**:
  - Hero strip: large V / I / P / R readouts with `aria-live="polite"`.
  - Mode selector + setpoint input panel (shows all four setpoints; active mode is highlighted).
  - Capability-gated tabs: Protection, Dynamic, Battery, Logger (reuses DMM trend-logger sparkline), Presets.
  - Raw SCPI console available per existing 2.4 pattern.
- [ ] **Tests**: facade unit tests, registry-resolution tests per DL3000 variant, server integration tests against the simulator personality, web component tests for the new panels. CI picks up the new simulator personality via `pnpm test:sim`.
- [ ] **Docs**: `docs/user/electronic-load.md` added (mirror of oscilloscope / power-supply / multimeter pages), linked from `docs/user/index.md` and the Pages site sidebar. Supported-hardware table (lands in 4.9) references the new kind.

## Notes

- Battery-discharge mode is useful enough at the bench that it's in this step rather than backlogged. Keep the UI focused on cutoff configuration + live remaining-capacity readout; any deeper runtime analysis (cycle counting, charger handoff) is follow-up work.
- Dynamic mode carries subtle safety implications (pulse loading can turn a marginal supply into an oscillator). UI copy should hint at "start with low frequency" and the default form values should be conservative.
- Resistance range in CR mode varies wildly per model — the profile's `resistanceRange` is the source of truth; never derive from setpoint clamp behavior.
- The `logging` capability intentionally reuses the DMM shape from 2.6c. The UI `TrendLogger.vue` can be generalized or duplicated; if duplicated, add a `TODO` and a backlog ticket to fold both onto a shared component once SA (4.5) also wants it.
- Keep the driver's SCPI command set narrow — it's easy to over-reach into every `:SOURce:*:RANGe*` setter. Stick to what the UI exposes; add behind a capability object later if needed.
