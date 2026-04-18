# 2.7b — Scope analysis (measurements, cursors, math)

Parent: [2.7 — Scope advanced features](./2-7-scope-advanced-features.md).
Depends on: 2.7a (measurements / cursors / math live inside the tab
strip introduced there and may reference channel state fields it added).

## Goal

Turn the hero uPlot into something you can actually measure against:
**automatic measurements** with statistics, **cursors** (manual, track,
auto), and a **math channel** covering arithmetic plus **FFT** with a
configurable window / span / center. Everything the DHO800 exposes at
the front panel for "read numbers off my trace", without leaving the
browser.

## Scope

### Facade additions (all optional)

```ts
export interface OscilloscopeMeasurementItem {
  readonly id: string;                     // "vpp", "freq", "rtime"
  readonly label: string;                  // "Peak-Peak", "Frequency", "Rise Time"
  readonly unit: string;                   // "V", "Hz", "s"
  readonly category: "voltage" | "time" | "other";
}

export interface OscilloscopeMeasurementCapability {
  readonly items: readonly OscilloscopeMeasurementItem[];
  readonly statistics: boolean;            // supports :MEASure:STATistic:*
  readonly maxTracked: number;             // visible slots on screen (typical: 10)
}

export interface OscilloscopeMeasurementValue {
  readonly itemId: string;
  readonly source: string;                 // "CHAN1" | "MATH" | …
  readonly value: number;
  readonly unit: string;
  readonly stats?: {
    readonly min: number;
    readonly max: number;
    readonly average: number;
    readonly stddev: number;
    readonly count: number;
  };
}

export type OscilloscopeCursorMode = "off" | "manual" | "track" | "auto";

export interface OscilloscopeCursorCapability {
  readonly modes: readonly OscilloscopeCursorMode[];
  readonly tracksXandY: boolean;
}

export interface OscilloscopeCursorReadout {
  readonly mode: OscilloscopeCursorMode;
  readonly ax?: number; readonly ay?: number;
  readonly bx?: number; readonly by?: number;
  readonly deltaX?: number; readonly deltaY?: number;
  readonly invDeltaX?: number;            // 1/Δt = derived frequency
}

export type OscilloscopeMathOperator =
  | "add" | "sub" | "mul" | "div" | "fft"
  | "integrate" | "differentiate" | "sqrt" | "log" | "ln" | "exp" | "abs"
  | "and" | "or" | "xor" | "not";

export type OscilloscopeFftWindow =
  "rect" | "hann" | "hamming" | "blackman" | "flatTop" | "triangle";

export interface OscilloscopeMathCapability {
  readonly operators: readonly OscilloscopeMathOperator[];
  readonly fftWindows: readonly OscilloscopeFftWindow[];
  readonly channels: number;               // how many math traces (Rigol: 1)
}

export interface OscilloscopeMathConfig {
  readonly operator: OscilloscopeMathOperator;
  readonly sources: readonly string[];     // ["CHAN1"] or ["CHAN1", "CHAN2"]
  readonly visible: boolean;
  readonly fft?: {
    readonly window: OscilloscopeFftWindow;
    readonly spanHz: number;
    readonly centerHz: number;
  };
}
```

Methods (all optional):

- Measurements: `getMeasurementCapability?()`,
  `getActiveMeasurements?(): Promise<readonly OscilloscopeMeasurementValue[]>`,
  `setActiveMeasurements?(items: readonly { itemId: string; source: string }[])`,
  `clearMeasurementStatistics?()`.
- Cursors: `getCursors?(): Promise<OscilloscopeCursorReadout>`,
  `setCursors?(config: Partial<OscilloscopeCursorReadout>): Promise<void>`.
- Math: `getMath?(): Promise<OscilloscopeMathConfig>`,
  `setMath?(config: OscilloscopeMathConfig): Promise<void>`,
  `readMathWaveform?(): Promise<Waveform>`.

### REST surface

- `GET  /api/sessions/:id/scope/measurements` — capability + active
  items + values (and stats when enabled).
- `POST /api/sessions/:id/scope/measurements` — body
  `{ items: { itemId, source }[], statistics?: boolean }`.
- `POST /api/sessions/:id/scope/measurements/clear-stats`.
- `GET  /api/sessions/:id/scope/cursors` / `POST …/cursors`.
- `GET  /api/sessions/:id/scope/math` / `POST …/math`.
- `GET  /api/sessions/:id/scope/math/waveform` — same shape as the
  existing channel waveform route, sourced from MATH.

Per-request validation: unknown `itemId` → 400; source not in active
channels → 400; more items than `maxTracked` → 400; math operator not
in capability → 400; FFT config on a non-FFT operator → 400; capability
missing → 409.

### UI additions on the scope detail page

Three new tabs on the side column:

- **Measure** tab
  - Catalog picker (grouped by `voltage` / `time` / `other`) with a
    source drop-down that defaults to the currently-active channel.
  - Table of active measurements with value, unit, and — when
    statistics are on — min / max / avg / stddev / count.
  - Statistics toggle switch; Clear-stats button; Remove-item button
    per row; `aria-live="polite"` so screen readers hear updates.
- **Cursors** tab
  - Mode radio (Off / Manual / Track / Auto).
  - Manual subform with A/B X and Y inputs paired with their readouts
    and derived Δ + 1/Δ (so "frequency from cursor spacing" comes for
    free). Track subform picks a source channel; Auto subform is just
    an info line explaining what the scope is tracking.
- **Math** tab
  - Operator drop-down.
  - Source pickers (one or two, driven by `operator`).
  - Enable / visible toggle; the math trace overlays on the hero uPlot
    with a distinct color and legend entry.
  - FFT subform (only when operator = FFT): window drop-down, span
    (Hz), center (Hz). Validation surfaces non-achievable combinations
    (e.g. span larger than Nyquist given the current sample rate).

## Acceptance criteria

- [ ] `IOscilloscope` gains optional `measurements`, `cursors`, and
      `math` capabilities plus the methods above.
- [ ] `RigolDho800` advertises `measurements` with the 41-item DHO800
      catalog (ids + labels + units + category), sets `statistics: true`,
      and sets `maxTracked: 10`. `cursors` advertises Manual / Track /
      Auto with X + Y tracking. `math` advertises the full operator
      set from the programming guide plus the FFT window list.
- [ ] REST endpoints validate payloads as above, forward to the driver,
      and return 409 on unsupported. `/scope/math/waveform` returns a
      well-formed `Waveform` binary frame.
- [ ] UI tabs render only when the capability is present; measurement
      table is keyboard-navigable with Remove accessible on each row;
      pass stats on / off is immediate (no stale state); math trace
      on the hero uPlot picks up a distinct color and gets a legend
      entry.
- [ ] Cursor readouts include Δ and 1/Δ; switching modes clears
      manual-only fields cleanly.
- [ ] FFT subform disables when a non-FFT operator is selected; span
      input clamps to `sampleRate / 2` derived from the current
      acquisition; window change round-trips through
      `:MATH:FFT:WINDow`.
- [ ] Unit tests cover a representative measurement set (at least one
      voltage, one time, one "other"), statistics parsing, clear-stats,
      cursor round-trip for each mode, math operator select + FFT
      config + math waveform binary framing.
- [ ] Integration tests cover `/scope/measurements`,
      `/scope/measurements/clear-stats`, `/scope/cursors`,
      `/scope/math`, and `/scope/math/waveform` — capability gating,
      input validation, and SCPI side-effects.

## Notes

- Measurement statistics rely on the instrument's own accumulator; the
  UI is a thin reflector, not a pandas replacement. If the DHO800's
  stats reset when the acquisition restarts, document that behaviour
  next to the Clear-stats button.
- The math trace is overlaid on the hero uPlot in 2.7b. Reference
  waveforms (2.7c) follow the same overlay pattern, so the hero plot
  becomes a small series ensemble rather than a single-channel view.
- Cursor values propagate back to any `aria-live` readouts so
  assistive-tech users hear when a tracking cursor jumps to a new
  edge.
