# 2.6c — DMM trend logging, temperature, and presets

Parent: [2.6 — DMM advanced features](./2-6-dmm-advanced-features.md).
Depends on: 2.6a (reuses `triggering` for buffered acquisition) and 2.6b
(stats card benefits from trend recorder feeding readings).

## Goal

Wire up the last three DMM features:

1. **Buffered trend logging** — `:SAMPle:COUNt` + `:INITiate` / `:FETCh?`
   / `:DATA:REMove?` streamed to the UI as NDJSON, with a live sparkline
   and CSV export.
2. **Temperature configuration** — unit (°C / °F / K) and transducer
   selection (RTD / thermocouple / thermistor) surfaced as a sub-card
   that only appears when the current mode is Temperature.
3. **Preset memory** — `*SAV` / `*RCL` slot grid, same shape as the 2.5
   PSU presets.

## Scope

### Facade additions (all optional)

```ts
export interface MultimeterLoggingCapability {
  readonly maxSamples: number;      // driver's buffer depth (e.g. 1e6)
  readonly minIntervalMs: number;   // fastest sample pacing the driver can reliably deliver
}

export interface MultimeterLoggingConfig {
  readonly intervalMs: number;
  readonly totalSamples?: number;   // undefined = run until stopped
}

export interface MultimeterLoggingSample {
  readonly seq: number;             // monotonic per run
  readonly value: number;
  readonly unit: string;
  readonly mode: MultimeterMode;
  readonly timestamp: number;       // wall-clock ms
  readonly elapsedMs: number;       // ms since run start
}

export type TemperatureUnit = "celsius" | "fahrenheit" | "kelvin";
export type TemperatureTransducer =
  | "pt100" | "pt1000" | "thermocouple-k" | "thermocouple-j"
  | "thermocouple-t" | "thermocouple-e" | "thermistor";

export interface MultimeterTemperatureCapability {
  readonly units: readonly TemperatureUnit[];
  readonly transducers: readonly TemperatureTransducer[];
}

export interface MultimeterTemperatureConfig {
  readonly unit: TemperatureUnit;
  readonly transducer: TemperatureTransducer;
}

export interface InstrumentPresetCapability {
  readonly slots: number;
}
```

`InstrumentPresetCapability` is deliberately named to be reused — 2.6c
introduces the shared type; 2.5's PSU `PsuPresetCapability` aliases to
it in a small follow-up commit so both usages are one thing.

Methods (all optional):

- `startLogging?(config: MultimeterLoggingConfig): Promise<{ runId: string }>`.
- `stopLogging?(): Promise<void>`.
- `getLoggingStatus?(): Promise<MultimeterLoggingStatus>` —
  `{ running, runId?, config?, samplesEmitted, samplesRemaining? }`.
- `fetchLoggedSamples?(runId: string, since?: number): Promise<
    readonly MultimeterLoggingSample[]
  >` — pageable by last-seen `seq`.
- `getTemperatureConfig?(): Promise<MultimeterTemperatureConfig>`.
- `setTemperatureConfig?(config: MultimeterTemperatureConfig): Promise<void>`.
- `getPresetCatalog?(): Promise<readonly boolean[]>`.
- `savePreset?(slot: number): Promise<void>`.
- `recallPreset?(slot: number): Promise<void>`.

### REST surface

- `GET  /api/sessions/:id/dmm/logging` — capability + current status.
- `POST /api/sessions/:id/dmm/logging/start` — body `MultimeterLoggingConfig`.
- `POST /api/sessions/:id/dmm/logging/stop`.
- `GET  /api/sessions/:id/dmm/logging/samples?since=<seq>` — paged
  NDJSON, flushed as samples become available.
- `GET  /api/sessions/:id/dmm/temperature` / `POST …/temperature`.
- `GET  /api/sessions/:id/dmm/presets` — returns
  `{ supported, slots, occupied: boolean[] }`.
- `POST /api/sessions/:id/dmm/presets/:slot/save`.
- `POST /api/sessions/:id/dmm/presets/:slot/recall`.

Validation matches the 2.5 pattern: capability missing → 409,
out-of-range slot / bad config → 400.

### UI additions on the DMM detail page

- **Trend recorder** card:
  - Interval input (ms), optional total-samples input (blank = run
    until Stop).
  - Start / Stop buttons with live status (running / idle / elapsed).
  - Live uPlot sparkline over the last N samples (configurable
    window; default 500).
  - Last-sample readout mirrored from the primary reading so it's
    usable without chart literacy.
  - CSV export with `seq, timestamp, elapsedMs, value, unit, mode`
    columns.
  - Respects `prefers-reduced-motion` by pausing sparkline animation.
- **Temperature** sub-card — only shown when the current mode is
  Temperature. Unit chips (°C / °F / K) plus a transducer drop-down.
  Displays a short description of the selected transducer (e.g. "Pt100
  RTD, α = 0.00385").
- **Presets** — reuse the 10-slot grid component from
  `PsuPresetsControl` once the shared shape lands; in the interim
  introduce `MultimeterPresetsControl` with the same visual contract.

## Acceptance criteria

- [ ] `IMultimeter` gains optional `logging`, `temperature`, and
      `presets` (shared `InstrumentPresetCapability`) plus the matching
      optional methods.
- [ ] `@lxi-web/core` exports `InstrumentPresetCapability`; PSU's
      existing `PsuPresetCapability` is retyped as the shared shape
      without breaking 2.5's server / UI code.
- [ ] `RigolDm858` advertises `logging` with the DM858's buffer depth
      and minimum reliable interval, `temperature` with the DM858's
      unit + transducer lists from the programming guide, and
      `presets` with the DM858's slot count (confirmed against
      `*SAV` / `*RCL` in the programming guide).
- [ ] REST endpoints validate input (interval < `minIntervalMs` → 400,
      totalSamples > `maxSamples` → 400, temperature config not in
      capability → 400, slot out of range → 400, capability missing →
      409) and forward to the driver.
- [ ] `/dmm/logging/samples` streams NDJSON, resumes from `since=<seq>`,
      and closes cleanly on Stop. A reconnecting client with the last
      seen `seq` receives every sample without gaps.
- [ ] Trend recorder's sparkline stays responsive at the advertised
      minimum interval; Start button is disabled while another run is
      active; CSV export includes both wall-clock and elapsed-ms
      columns.
- [ ] Temperature sub-card only renders while the current mode is
      Temperature; unit + transducer round-trip through SCPI.
- [ ] Preset grid saves / recalls via `*SAV` / `*RCL`; overwrite of a
      populated slot prompts confirmation; empty slots disable Recall.
- [ ] Unit tests cover the driver SCPI for `:INITiate` / `:FETCh?` /
      `:DATA:REMove?` paging, `:UNIT:TEMPerature`, transducer select,
      `*SAV` / `*RCL`, and the shared preset capability alias.
- [ ] Integration tests cover `/dmm/logging/*`, `/dmm/temperature`, and
      `/dmm/presets/*` — capability advertising, NDJSON streaming
      with `since=`, input validation, and SCPI side-effects.

## Notes

- Logging fires its own polling loop for now (per the 2.6 overview);
  once 5.1 lands, each fetched sample also publishes a
  `measurementSample` event on the bus so the 5.4 timeline can draw
  it alongside scope and PSU data.
- The shared `InstrumentPresetCapability` is introduced here and also
  consumed by 2.5 and 2.7c. Landing order is 2.6c first (defines the
  type), then a small PSU retype commit, then 2.7c picks it up.
- If the DM858's `:DATA:REMove? <n>` returns values in chunks larger
  than what NDJSON can ship in one tick, the server fans them out
  without collapsing — NDJSON consumers can reassemble by `seq`.
