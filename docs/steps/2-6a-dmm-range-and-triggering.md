# 2.6a — DMM range, NPLC, and triggering

Parent: [2.6 — DMM advanced features](./2-6-dmm-advanced-features.md).

## Goal

Give operators explicit control over the **low-level acquisition behaviour**
of the DMM — manual vs. auto range, integration time in NPLC, AutoZero
on/off/once, trigger source and slope, delay, sample count, and a
software-trigger action — plus first-class support for **4-wire
resistance** as a new mode.

## Scope

### Facade additions (all optional)

```ts
export interface MultimeterRange {
  readonly label: string;       // "10 V", "100 mA", "10 MΩ"
  readonly upper: number;       // upper limit in base units
  readonly resolution?: number; // preferred resolution for this range
}

export interface MultimeterRangingCapability {
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Readonly<Record<MultimeterMode, readonly MultimeterRange[]>>;
  readonly nplc: readonly number[];     // e.g. [0.02, 0.2, 1, 10, 100]
  readonly autoZero: boolean;           // driver supports AutoZero ON/OFF/ONCE
}

export type MultimeterTriggerSource = "immediate" | "external" | "bus" | "software";
export type MultimeterTriggerSlope = "positive" | "negative";

export interface MultimeterTriggerCapability {
  readonly sources: readonly MultimeterTriggerSource[];
  readonly slopes: readonly MultimeterTriggerSlope[];
  readonly sampleCountRange: { min: number; max: number };
  readonly delayRangeSec: { min: number; max: number };
}
```

Methods added to `IMultimeter` (all optional):

- `getRange?(): Promise<MultimeterRangeState>` — `{ mode, upper, auto }`.
- `setRange?(mode, range: number | "auto"): Promise<void>`.
- `getNplc?(): Promise<number>` / `setNplc?(value: number): Promise<void>`.
- `setAutoZero?(mode: "on" | "off" | "once"): Promise<void>`.
- `getTriggerConfig?(): Promise<MultimeterTriggerConfig>`.
- `setTriggerConfig?(config: MultimeterTriggerConfig): Promise<void>`.
- `trigger?(): Promise<void>` — fire a single software trigger.

### `MultimeterMode` enum

Add `"fourWireResistance"`. Existing drivers that don't list it in
`supportedModes` are unaffected.

### REST surface

- `GET  /api/sessions/:id/dmm/ranging` — returns capability + current
  `{ mode, upper, auto, nplc, autoZero }`.
- `POST /api/sessions/:id/dmm/ranging` — body `{ mode?, range?, nplc?, autoZero? }`.
- `GET  /api/sessions/:id/dmm/trigger` — capability + current config.
- `POST /api/sessions/:id/dmm/trigger` — body `{ source?, slope?, delaySec?, sampleCount? }`.
- `POST /api/sessions/:id/dmm/trigger/fire` — software trigger.

All unsupported routes return `supported: false` on GET and `409` on
mutating POSTs, matching 2.5's convention.

### UI additions on the DMM detail page

- **Range & integration** card — mode-aware manual-range picker with an
  explicit **Auto** option, NPLC chip bar (0.02 … 100), AutoZero
  tri-state button (On / Off / Once) that springs back to Off after
  firing Once.
- **Trigger** card — source (Imm / Ext / Bus / Software), slope (only
  enabled when Ext), delay, sample count, and a "Fire software trigger"
  button (only enabled when source is Software).
- **Mode selector** grows a **4W Ω** chip; the first time an operator
  picks it, show a non-blocking hint explaining the four-terminal
  wiring requirement.

## Acceptance criteria

- [x] `MultimeterMode` includes `"fourWireResistance"`; drivers that
      don't advertise it in `supportedModes` continue to type-check.
- [x] `IMultimeter` gains optional `ranging` and `triggering` capabilities
      plus the methods above. Non-supporting drivers keep working
      unchanged.
- [x] `RigolDm858` advertises `ranging` with the DM858's per-mode range
      list and NPLC options drawn from the programming guide, and
      `triggering` with the DM858's source / slope / delay / sample-count
      ranges. 4-wire resistance is wired to `:CONFigure:FRESistance AUTO`
      (or the DM858 equivalent) and round-trips through `getMode` /
      `setMode`.
- [x] REST endpoints validate input (400 on range below/above capability
      bounds, 400 on NPLC not in `capability.nplc`, 409 on unsupported)
      and forward to the driver.
- [x] UI hides each card cleanly when unsupported; AutoZero ONCE does
      not leave the button stuck in the Once state; software-trigger
      button is disabled unless source is Software.
- [x] Unit tests cover range clamping, NPLC round-trip, AutoZero
      pulse semantics, software-trigger fire, and the new mode's
      `:CONFigure:FRESistance` wiring.
- [x] Integration tests cover `/dmm/ranging`, `/dmm/trigger`, and
      `/dmm/trigger/fire` — capability advertising, input validation,
      and SCPI side-effects against a fake port.

## Notes

- No trend buffering or `INITiate` / `FETCh?` wiring in this slice;
  software trigger here is "trigger a single reading" via `:READ?` or
  the driver's equivalent, not a buffered burst. Buffered flow lands in
  2.6c.
- AutoZero ONCE is a pulse semantic (no persistent state); the UI
  deliberately reflects that.
