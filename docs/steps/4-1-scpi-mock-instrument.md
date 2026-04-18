# 4.1 — Simulator framework (TCP, personality-driven)

## Goal

Provide an **in-repo SCPI/LXI-style simulator** that is rich enough to validate
the full stack — connect, `*IDN?`, `*OPT?`, session routing, typed routes,
WebSocket updates, per-kind UI panels — **without** any lab hardware. The
simulator is **framework-shaped**, not a one-off mock: each "personality" (a
specific instrument model) is described as a **typed TS module** backed by a
**JSON fixture** so adding a new model is mostly data entry plus a handful of
handlers for interactive commands. The simulator is the hardware substitute
that every later Epic 4 step relies on: driver family refactor (4.2),
new-kind facades (4.3 / 4.4 / 4.5), and vendor packs (4.6 / 4.7 / 4.8).

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (simulator and additional device coverage).
- Related: transport [1-1-transport-and-scpi-core.md](1-1-transport-and-scpi-core.md), identity [1-2-identity-and-routing.md](1-2-identity-and-routing.md), Rigol pack [1-4-vendor-packs-rigol.md](1-4-vendor-packs-rigol.md).
- Feeds: [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md), [4-3-electronic-load.md](4-3-electronic-load.md), [4-4-signal-generator.md](4-4-signal-generator.md), [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md), [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md), [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md), [4-8-vendor-pack-owon.md](4-8-vendor-pack-owon.md).

## Acceptance criteria

- [x] A **simulator package** — landed as **`packages/sim`** (private `@lxi-web/sim` pnpm workspace). `Simulator` class + CLI (`pnpm sim --personality rigol-dho804 --port 5025`) — verified by `integration.test.ts` connecting `ScpiSession.openTcp` against it end-to-end.
- [x] **Personality descriptor** — `SimulatorPersonality` interface in `packages/sim/src/personality.ts` with `id`, optional `kind`, `idn` template (`{serial}` replaced per instance), `opt` (`*OPT?`), optional `fixture`, `exactHandlers` (keyed by normalised header), `prefixHandlers` (regex → handler), and `initialState` (per-socket mutable state factory).
- [x] **JSON fixture** — `fixture.responses` keyed by normalised SCPI header resolves read-only queries without code; extra keys are handler-visible via `ctx.fixture` for live-looking readings.
- [x] **Three working personalities** ship: `rigol-dho804` (DHO800 regex), `rigol-dp932e` (DP900 regex), `rigol-dm858` (DM800 regex) — asserted by `test/integration.test.ts` against the production driver registry.
- [x] **`generic-unknown`** personality with `ACME INSTRUMENTS,GENERIC-1000,...` IDN so the raw-SCPI path can be exercised end-to-end.
- [x] **Hot-swap IDN / `*OPT?`** — `Simulator` accepts `idnOverride` / `optOverride` at construct time and the CLI / bench config expose `--idn` / `--opt` / per-entry `idnOverride`. 4.2 profile-variant tests reuse this path.
- [x] **Multi-instance mode** — `--config bench.rigol.json` boots N listeners in one process; schema is `{ host?, instances: [{ personality, port, ... }] }`.
- [x] **Newline framing** — simulator reads LF-terminated lines, appends `\n` after every ASCII / binary reply. IEEE 488.2 definite-length block encoder in `src/handlers/ieee488-block.ts` emits `#<n><len><bytes>`.
- [x] **Error queue** — `SYST:ERR?` / `SYSTEM:ERROR?` return `0,"No error"` by default; unknown headers push `-113`; handlers call `ctx.pushError(code, message)`.
- [x] **`pnpm sim:rigol`** spins up DHO804 @ 5025, DP932E @ 5026, DM858 @ 5027 (documented in `packages/sim/README.md`). **`pnpm test:sim`** runs the integration test that connects each personality through `ScpiSession` and the production driver registry.
- [x] **README** — `packages/sim/README.md` covers CLI usage, architecture, handler-resolution order, the shipped-personality table, and the data-only vs. with-handlers personality add path.
- [x] **Config via CLI flags and env vars** — `--host` / `--port` / `--verbose` plus `LXI_SIM_HOST` / `LXI_SIM_PORT` / `LXI_SIM_VERBOSE`; defaults localhost + 5025.

## Architecture

- **`SimulatorPersonality` (TS)** — the typed contract per model. Holds metadata + a handler table + a fixture loader. The type lives in `packages/sim/src/personality.ts` so personality modules get full type-checking.
- **`PersonalityRegistry`** — loads personalities from `packages/sim/personalities/*` at startup. Personalities can live in sibling packages for vendor drops (e.g. `packages/sim/personalities/siglent/sds1000x-e.ts`) so the same framework serves 4.6–4.8.
- **`Simulator` runtime** — owns the TCP listener, buffers bytes until `\n`, dispatches to `SimulatorSession` per socket. Sessions hold the mutable personality state (current mode, current range, saved presets, etc.) so each connection is isolated.
- **Handler resolution order per incoming command**:
  1. exact-match handler from the personality module
  2. prefix-match handler (e.g. `:CHANnel<N>:SCALe?`)
  3. JSON fixture lookup (supports `{channel}` / `{slot}` token substitution)
  4. fallback: `*IDN?` / `*OPT?` / `*RST` / `SYST:ERR?` built-ins
  5. else: log + return `-113,"Undefined header"` and push on the error queue
- **Fixtures are opt-in mutable** — a handler may write back to fixture state so a `:CHANnel1:SCALe 0.5` write is observable from the next `:CHANnel1:SCALe?` read, which keeps the UI round-tripping believable without coding every setter.

### Example on-disk layout

```
packages/sim/
  src/
    simulator.ts          # TCP listener + session fan-out
    personality.ts        # SimulatorPersonality type + registry
    handlers/
      scpi-common.ts      # *IDN?, *OPT?, *RST, SYST:ERR? fallbacks
      ieee488-block.ts    # binary block encoder
    cli.ts                # pnpm sim entry point
  personalities/
    rigol/
      dho804.ts           # scope handlers + fixture path
      dho804.fixture.json # channel scales, waveform sample, measurements
      dp932e.ts
      dp932e.fixture.json
      dm858.ts
      dm858.fixture.json
    generic-unknown.ts
```

## Notes

- Fidelity to real instruments is **not** a goal — only **protocol-shaped** behavior for UI validation. Waveforms can be canned synthetic signals; measurements can be deterministic per personality; noise parameters are optional.
- Personality fixtures are the artefact that ships with every later step (4.3 adds `rigol/dl3021.*`, 4.5 adds `siglent/ssa3032x.*`, etc.). Keeping the fixture format cheap matters.
- Multi-instance mode is what enables the **docs-only preview** posture from the plan: `pnpm sim --config sim/siglent-bench.json` produces a whole simulated Siglent bench for screenshots, manual UI exercise, and CI regression — which is the primary validation path for vendors we cannot physically test.
- `*OPT?` is a first-class part of every personality because 4.2's capability refinement depends on it — personalities for the same model should be able to advertise different option strings ("DHO804 with SD-SPI but no BW upgrade" vs. "DHO804 with everything").
- Keep the CLI stable — future Epic X orchestration tests (event bus / rule engine / sequences) will script the simulator, and churning the CLI contract invalidates fixtures.
