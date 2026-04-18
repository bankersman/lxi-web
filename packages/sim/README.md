# @lxi-web/sim

In-repo TCP **SCPI simulator framework** used to validate the lxi-web stack
end-to-end — connect, `*IDN?`, `*OPT?`, session routing, typed routes,
WebSocket updates, per-kind UI panels — without any lab hardware.

This package is **private** (not published); it exists so developers and CI
have a predictable multi-instrument bench.

## Running it

```bash
# one-shot: serve the DHO804 personality on the usual SCPI port
pnpm --filter @lxi-web/sim sim -- --personality rigol-dho804 --port 5025

# three-instrument bench on ports 5025/5026/5027 (scope / PSU / DMM)
pnpm --filter @lxi-web/sim sim:rigol

# list available personalities
pnpm --filter @lxi-web/sim sim -- --list
```

`--verbose` (or `LXI_SIM_VERBOSE=1`) turns on per-connection logging.

Point the dashboard at the simulator exactly like real hardware: **Add
device** → host `127.0.0.1`, port `5025` (or whatever port the CLI printed).

## Architecture

- **`SimulatorPersonality`** (`src/personality.ts`) — typed contract every
  personality implements. Carries the `*IDN?` template, optional `*OPT?`,
  and two handler tables (exact-match and prefix-match) plus an optional
  JSON fixture.
- **`Simulator`** (`src/simulator.ts`) — TCP listener. One listener per
  instrument; the CLI spins up N listeners for a bench.
- **`SimulatorSession`** (`src/session.ts`) — per-socket SCPI dispatcher.
  Owns the mutable per-connection state map (setpoints, presets, error
  queue) so every connection is isolated.
- **`PersonalityRegistry`** (`src/registry.ts`) — simple id → personality
  map used by the CLI to resolve `--personality` flags and by tests to
  look up personalities by id.

### Handler resolution order

For every incoming command:

1. **Exact-match** handler keyed by the normalised header (`CHANNEL1:SCALE?`).
2. **Prefix-match** handler (first regex in `prefixHandlers` that matches).
3. **Fixture lookup** — `fixture.responses[normalized]` returned as a line.
4. **SCPI common fallbacks** — `*IDN?`, `*OPT?`, `*RST`, `*CLS`, `SYST:ERR?`,
   `*OPC?`, `*WAI`, `*STB?`, `*ESR?`, `*TST?`.
5. Otherwise: push `-113,"Undefined header"` onto the error queue; for
   queries the simulator returns an empty line so the client does not hang.

The personality is free to re-use the `fixture.responses` map itself when a
handler only needs to cover a small set of variants.

## Shipped personalities

| id                  | kind          | notes                                             |
| ------------------- | ------------- | ------------------------------------------------- |
| `rigol-dho804`      | oscilloscope  | 4 ch, sine waveform fixture, MEASure catalog      |
| `rigol-dp932e`      | powerSupply   | 3 ch, voltage / current / output round-trip       |
| `rigol-dm858`       | multimeter    | live-looking primary reading + mode echo          |
| `generic-unknown`   | unknown       | IDN does **not** match any driver — raw SCPI path |

Every Rigol personality's IDN matches the production Rigol driver regex
(`/^DHO8\d{2}/i`, `/^DP9\d{2}/i`, `/^DM8\d{2}/i`) so the dashboard connects
unchanged.

## Adding a personality

- **Data-only variant:** copy `personalities/rigol/dm858.fixture.json` →
  tweak the canned responses → register it in
  `personalities/index.ts`.
- **With handlers:** copy `personalities/rigol/dho804.ts`, implement the
  exact / prefix handlers you need, and register the module.

Personalities must be **deterministic enough to test against**; "plausibly
shaped" is the bar, not "bit-perfect with hardware".

## Bench config (`--config`)

`bench.rigol.json` starts all three Rigol personalities in one process on
fixed ports. The schema is:

```json
{
  "host": "127.0.0.1",
  "instances": [
    { "personality": "rigol-dho804", "port": 5025, "serial": "DHO8SIM000001" }
  ]
}
```

The same config file is reused for CI's multi-session tests. Hot-swapping
`*IDN?` / `*OPT?` for a single personality is done by setting
`idnOverride` / `optOverride` on the bench entry (used by the 4.2
profile-variant tests).

## Tests

- `pnpm --filter @lxi-web/sim test` — pure unit tests over parser,
  encoder, and personality handlers, plus a small end-to-end TCP + SCPI
  test (`integration.test.ts`) that connects via `@lxi-web/core`
  `ScpiSession`.
- `pnpm test:sim` at the repo root runs the integration tests only, for
  CI.
