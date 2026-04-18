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

- [x] **`IElectronicLoad` facade** in `packages/core/src/facades/electronic-load.ts`:
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
- [x] **DeviceKind** enum grows an `electronicLoad` value; `DEVICE_KINDS` array updated; `DeviceKindIcon` wired to Lucide `PlugZap`.
- [x] **Rigol DL3000 driver** (`packages/core/src/drivers/rigol/dl3000.ts`) implementing the core facade + `protection` + `battery` + `presets` capabilities.
  - Profile-driven per 4.2 — variants DL3021 (150 V / 40 A / 200 W) and DL3031 (150 V / 60 A / 350 W) share the SCPI dialect; profile differs in channel limits and protection max.
  - Regex `/^DL30\d{2}/i`; generic `rigol-dl3000` catch-all for unknown DL30xx with a conservative profile.
  - `refineDl3000Profile` stub in place for future license / option refinement.
  - Logging capability intentionally deferred — the DMM `logging` shape is wired through the facade so it can be added without a signature change.
- [x] **Simulator personality** in 4.1: `rigol-dl3021` — CC/CV/CR/CP setpoint echoes, synthesised V/I/P/R from a 12 V virtual DUT, protection enable + level + trip round-trips, dynamic + battery state maps. Placeholder `siglent-sdl1020x-e` reserves the IDN for the 4.6 Siglent pack; registry currently returns no driver match.
- [x] **Server**: route group `/api/sessions/:id/eload/*` with state, enabled, mode, setpoint, measure, protection (incl. `/clear`), dynamic, battery (start/stop), logging (start/stop/samples, gated), presets (save/recall, gated).
- [x] **WebSocket**: `eload.measurement` (V/I/P/R @ 750 ms) + `eload.state` (full snapshot @ 2 s) reading topics; `ReadingScheduler` fan-out matches the 2.2 pattern.
- [x] **Dashboard card**: `EloadMiniPanel.vue` with mode pill, enable toggle, live V / I / P readout, trip badge.
- [x] **Detail page**: `EloadPanel.vue` with `aria-live` hero V/I/P/R strip, mode selector + all four setpoints, capability-gated tabs Protection / Dynamic / Battery / Presets, plus the shared Raw SCPI console from 2.4. Dynamic-mode full form is a backlog follow-up; the tab explains the SCPI surface and warns on pulse-loading safety.
- [x] **Tests**: `packages/core/test/eload.test.ts` (facade + DL3000 variant profiles + registry), `packages/sim/test/integration.test.ts` (DL3021 round-trip + SDL IDN reservation), `packages/server/test/http.test.ts` (state snapshot, setpoint + protection validation, 409 gating). Web component tests deferred — the `@lxi-web/web` package has no Vitest harness yet; adding one is tracked alongside the generalised trend-logger in 4.4/4.5.
- [x] **Docs**: `docs/user/electronic-load.md` added and mirrored into `docs/site/manual/`, linked from `docs/user/index.md` and the VitePress sidebar. Supported-hardware table lands in 4.9.

## Notes

- Battery-discharge mode is useful enough at the bench that it's in this step rather than backlogged. Keep the UI focused on cutoff configuration + live remaining-capacity readout; any deeper runtime analysis (cycle counting, charger handoff) is follow-up work.
- Dynamic mode carries subtle safety implications (pulse loading can turn a marginal supply into an oscillator). UI copy should hint at "start with low frequency" and the default form values should be conservative.
- Resistance range in CR mode varies wildly per model — the profile's `resistanceRange` is the source of truth; never derive from setpoint clamp behavior.
- The `logging` capability intentionally reuses the DMM shape from 2.6c. The UI `TrendLogger.vue` can be generalized or duplicated; if duplicated, add a `TODO` and a backlog ticket to fold both onto a shared component once SA (4.5) also wants it.
- Keep the driver's SCPI command set narrow — it's easy to over-reach into every `:SOURce:*:RANGe*` setter. Stick to what the UI exposes; add behind a capability object later if needed.
