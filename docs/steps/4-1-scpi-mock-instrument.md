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

- [ ] A **simulator package** (`packages/sim` or `tools/sim`, pick one and commit) that exposes a `Simulator` class + CLI entry point. `pnpm sim --personality rigol-dho804 --port 5025` starts a TCP listener that speaks SCPI to the existing `ScpiSession`.
- [ ] **Personality descriptor** is a TS module implementing a `SimulatorPersonality` interface: `id`, `kind`, `idn` (template with `{serial}` placeholder), optional `opt` (`*OPT?` string), `fixtures` (path(s) to JSON), `handlers` (map from SCPI command prefix to a handler that receives a parsed command + personality state).
- [ ] **JSON fixture** carries canned responses keyed by SCPI command (and optional per-channel variants), so read-only queries (`:CHANnel1:SCALe?`, `:MEASure:VOLTage:DC?`, `:SENSe:FREQuency:APERture?`, …) resolve without code. Fixtures may include numeric ranges / noise parameters for live-looking readings.
- [ ] **At least three working personalities** ship with this step: `rigol-dho804` (oscilloscope), `rigol-dp932e` (PSU), `rigol-dm858` (DMM). Each is IDN-compatible with the existing driver regexes so the current UI connects unchanged.
- [ ] An **unknown** personality (`generic-unknown`) returns a non-matching IDN so the raw-SCPI path can be exercised end-to-end.
- [ ] **Hot-swap IDN / `*OPT?`** via config file so one listener can pretend to be different models for registry / profile testing — used by 4.2 profile tests to iterate DHO802/804/812/814 without four processes.
- [ ] CLI supports **multi-instance mode**: `pnpm sim --config sim/bench.json` starts N listeners on N ports from one config file, for multi-session UI tests.
- [ ] **Newline framing** matches real gear (`\n` write, `\n` read). IEEE definite-length block responses use the same `#Nxxx…` header format the existing binary queries (`:DISPlay:DATA?`, `:WAVeform:DATA?`) expect.
- [ ] **Error queue** (`SYST:ERR?`) returns `0,"No error"` by default; handlers may push synthetic errors for negative-path tests.
- [ ] **pnpm script** `pnpm sim:rigol` (or equivalent) spins up the three Rigol personalities on fixed ports (document the port map in the step) so a developer can `pnpm dev` and click through the whole dashboard immediately. CI script `pnpm test:sim` runs an integration test that connects each personality, exercises the primary typed route, and disconnects.
- [ ] **README / user-docs snippet**: how to point the UI at the simulator (host, port, personality name), and how to add a new personality — both a data-only variant (edit JSON fixture) and a code-plus-data variant (new handler module).
- [ ] Port / host / log-verbosity all configurable via CLI flags **and** environment variables; defaults are safe (localhost, non-privileged ports).

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
- Keep the CLI stable — future Epic 5 orchestration tests will script the simulator, and churning the CLI contract invalidates fixtures.
