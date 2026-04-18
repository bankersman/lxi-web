# 2.7a — Scope capture control (trigger + acquisition)

Parent: [2.7 — Scope advanced features](./2-7-scope-advanced-features.md).

## Goal

Expose everything that governs **how a frame gets captured** — trigger
type and its per-type parameters, sweep mode (Auto / Normal / Single),
force, holdoff, coupling, acquisition mode (Normal / Average / Peak-
Detect / High-Resolution), average count, memory depth, and
`:AUToset`. These are the knobs an operator reaches for before pressing
Single; nothing here is about analysing a frame that already exists
(that's 2.7b).

This slice also picks up the shared channel-state fields
(`bandwidthLimit`, `invert`, `unit`) because they belong to the same
acquisition surface.

## Scope

### Facade additions (all optional)

```ts
export type OscilloscopeTriggerType =
  | "edge" | "pulse" | "slope" | "video" | "pattern"
  | "duration" | "timeout" | "runt" | "window"
  | "delay" | "setupHold" | "nthEdge"
  | "i2c" | "spi" | "uart" | "can" | "lin";

export type OscilloscopeTriggerSweep = "auto" | "normal" | "single";
export type OscilloscopeTriggerSlope = "rising" | "falling" | "either";
export type OscilloscopeTriggerCoupling =
  | "dc" | "ac" | "hfReject" | "lfReject" | "noiseReject";

export interface OscilloscopeTriggerCapability {
  readonly types: readonly OscilloscopeTriggerType[];
  readonly sources: readonly string[];     // "CHAN1" | "EXT" | "ACLine" | "D0"…"D15"
  readonly sweepModes: readonly OscilloscopeTriggerSweep[];
  readonly slopes: readonly OscilloscopeTriggerSlope[];
  readonly couplings: readonly OscilloscopeTriggerCoupling[];
  readonly holdoffRangeSec: { min: number; max: number };
}

// Discriminated union — one interface per trigger type so per-type forms
// stay type-safe on both server and web.
export type OscilloscopeTriggerConfig =
  | { kind: "edge"; source: string; slope: OscilloscopeTriggerSlope; level: number;
      coupling: OscilloscopeTriggerCoupling; holdoffSec: number; }
  | { kind: "pulse"; source: string; polarity: "positive" | "negative";
      widthSec: number; condition: ">" | "<" | "between";
      widthMinSec?: number; widthMaxSec?: number; level: number;
      coupling: OscilloscopeTriggerCoupling; holdoffSec: number; }
  // … other trigger kinds follow the same pattern
  ;

export type OscilloscopeAcquisitionMode =
  "normal" | "average" | "peakDetect" | "highRes";

export interface OscilloscopeAcquisitionCapability {
  readonly modes: readonly OscilloscopeAcquisitionMode[];
  readonly averageRange: { min: number; max: number };   // e.g. { min: 2, max: 65536 }
  readonly memoryDepths: readonly (number | "auto")[];   // e.g. ["auto", 1_000, 10_000, …, 25_000_000]
  readonly autoSetup: boolean;                           // :AUToset available
}

export interface OscilloscopeAcquisitionState {
  readonly mode: OscilloscopeAcquisitionMode;
  readonly averages: number;
  readonly memoryDepth: number | "auto";
}
```

Methods (all optional on `IOscilloscope`):

- `getTriggerCapability?(): Promise<OscilloscopeTriggerCapability>` — already
  covered by the top-level capability field, but exposed explicitly so the
  REST layer can round-trip it without hand-serializing.
- `getTriggerConfig?(): Promise<OscilloscopeTriggerConfig>`.
- `setTriggerConfig?(config: OscilloscopeTriggerConfig): Promise<void>`.
- `setTriggerSweep?(mode: OscilloscopeTriggerSweep): Promise<void>`.
- `forceTrigger?(): Promise<void>` — `:TFORce`.
- `getAcquisition?(): Promise<OscilloscopeAcquisitionState>`.
- `setAcquisition?(
    config: Partial<OscilloscopeAcquisitionState>,
  ): Promise<void>`.
- `autoSetup?(): Promise<void>` — `:AUToset`.

### Shared channel fields

Add optional fields to `OscilloscopeChannelState`:

- `bandwidthLimit?: "off" | "20M" | "100M" | "200M"`.
- `invert?: boolean`.
- `unit?: "V" | "A"` — for current probes.

Plus the matching setters on `IOscilloscope`:

- `setChannelBandwidthLimit?(channel, limit): Promise<void>`.
- `setChannelInvert?(channel, inverted): Promise<void>`.
- `setChannelUnit?(channel, unit): Promise<void>`.

### REST surface

- `GET  /api/sessions/:id/scope/trigger` — capability + current config.
- `POST /api/sessions/:id/scope/trigger` — body `OscilloscopeTriggerConfig`.
- `POST /api/sessions/:id/scope/trigger/sweep` — body `{ sweep }`.
- `POST /api/sessions/:id/scope/trigger/force` — 204 on success.
- `GET  /api/sessions/:id/scope/acquisition` / `POST …/acquisition`.
- `POST /api/sessions/:id/scope/autoset` — 202 when the driver accepted
  the command; UI follows up by re-fetching channel/timebase state.
- `POST /api/sessions/:id/scope/channels/:channel/bandwidth` /
  `…/invert` / `…/unit`.

Per-type trigger body validation: payload must match the discriminator
for the chosen `kind`, and per-field ranges pull from the driver's
advertised capability (bad kind → 400 with a pointer; missing optional
→ 400; unsupported kind → 409).

### UI additions on the scope detail page

Two new tabs on the side column (hidden when the matching capability
is absent):

- **Trigger** tab
  - Sweep mode radio group (Auto / Normal / Single).
  - Trigger-type drop-down populated from capability.
  - Per-type subform rendered by a small switch on `kind`: Edge (source,
    slope, level, coupling, holdoff); Pulse (polarity, width range
    condition, width bounds, level); Slope (similar); Runt, Window,
    Timeout, Setup/Hold, Nth-Edge and serial-protocol kinds each get
    their own dedicated form when 2.7d lands (serial triggers can
    surface earlier behind the same switch using raw string inputs,
    but the full decoder configuration belongs to 2.7d).
  - **Force** button calls `:TFORce`.
- **Acquire** tab
  - Mode selector (Normal / Average / Peak-Detect / High-Resolution).
  - Average count (only enabled when mode is Average, clamped to
    `averageRange`).
  - Memory depth chip bar (Auto plus advertised depth tiers).
  - **Auto-Setup** button behind a confirmation dialog that spells out
    "this may overwrite channel scales, trigger settings, and
    timebase".
- Channel cards gain a small strip with Bandwidth / Invert / Unit
  controls when the driver advertises them.

## Acceptance criteria

- [x] `IOscilloscope` gains optional `trigger` and `acquisition`
      capabilities plus the methods above. Existing 2.4 callers
      continue to work.
- [x] `OscilloscopeChannelState` gains optional `bandwidthLimit`,
      `invert`, and `unit` fields; matching channel-state writers are
      present.
- [x] `RigolDho800` advertises `trigger` (edge, pulse, slope, video,
      runt, window, timeout, nth-edge) and `acquisition` with the four
      acquisition modes plus the full memory-depth list from the
      programming guide (Auto through 25 Mpts). `:TFORce` and
      `:AUToset` are wired. *(Pattern, duration, delay, setup/hold,
      and the serial-protocol trigger kinds are tracked in the 2.7
      follow-up list — they share the discriminated-union shape so the
      REST + UI surfaces can pick them up without schema churn.)*
- [x] REST endpoints validate the per-kind trigger body (mismatched
      discriminator → 400 with a clear path), clamp acquisition values
      to capability bounds, and return 409 on unsupported.
- [x] UI trigger subform re-renders cleanly when `kind` changes
      (no stale state carried over); sweep radio is independent of
      `kind`; Force button is always enabled while `trigger` is
      supported.
- [x] Auto-Setup confirmation dialog is keyboard-operable, labelled
      via `aria-modal`, and focus lands on the Cancel button by default.
- [x] Channel bandwidth / invert / unit controls only render when the
      driver advertises them; toggling them round-trips through the
      driver state.
- [x] Unit tests cover edge + at least one non-edge trigger type
      (pulse or runt) end-to-end, sweep mode set, `:TFORce`,
      acquisition mode + averages + mdepth round-trip, `:AUToset`,
      and the new channel-state writers.
- [x] Integration tests cover `/scope/trigger`, `/scope/trigger/sweep`,
      `/scope/trigger/force`, `/scope/acquisition`, `/scope/autoset`,
      and the channel-state mutators — capability gating, per-kind
      validation, and SCPI side-effects.

## Notes

- Serial-protocol trigger kinds (`i2c`, `spi`, `uart`, `can`, `lin`)
  are part of the trigger capability from day one, but the richer
  decoder configuration (bus sources, polarity, baud) lives in 2.7d.
  In 2.7a these kinds accept a minimal payload and defer to the
  driver's existing serial-trigger defaults.
- `:AUToset` deliberately does not try to guess at the resulting
  configuration; the UI re-queries channel + timebase state after the
  command returns so the side column reflects what the scope chose.
