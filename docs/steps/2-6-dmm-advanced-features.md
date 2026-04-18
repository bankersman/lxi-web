# 2.6 — DMM advanced features

## Goal

Extend `IMultimeter` with **optional capability objects** (same pattern as
2.5 on `IPowerSupply`) so drivers can advertise the advanced DMM features
that the DM858 actually has — manual range, NPLC, math (null / dB / dBm /
statistics / pass-fail), dual display, trend logging, triggering, and
temperature — without forcing those features on other vendors.

The current facade is "set mode, press read"; this step gives the UI
everything a bench operator expects from a 5½-digit DMM.

## Standards landscape

The IVI Foundation's **IVI-4.8 IviDmm** class is the industry-standard
abstraction over bench DMMs and drives the vocabulary here. Relevant
groups:

- **Base IviDmm** — function (DCV, ACV, DCI, ACI, 2W-Ω, 4W-Ω, Freq, Period,
  Temperature), range / resolution, AutoRange, AutoZero, trigger source.
- **AutoRangeValue** — read the currently-selected range even while in
  auto.
- **PowerLineFrequency** — NPLC integration is normalized in cycles
  (0.02 / 0.2 / 1 / 10 / 100 are the canonical slots).
- **SoftwareTrigger / TriggerSlope** — arm + fire under program control,
  slope selection for external.
- **MultiPoint** — `SampleCount`, `TriggerCount`, `Sample Trigger` — the
  buffered / burst mode that backs trend logging.
- **ACMeasurement / FrequencyMeasurement / TemperatureMeasurement** —
  per-function extensions for bandwidth, aperture, transducer.
- **DeviceInfo** — aperture, self-test, calibration handle.

The SCPI mapping for these groups is effectively stable across Keysight
34xxx, R&S, Rigol DM3xxx / DM858, Siglent SDM3xxx:

| Concept           | Typical SCPI                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| Configure         | `:CONFigure:<fn> <range>,<res>` (e.g. `:CONFigure:VOLTage:DC 10,1e-5`)    |
| Range             | `:SENSe:<fn>:RANGe[:UPPer] <v>` + `:SENSe:<fn>:RANGe:AUTO ON\|OFF`        |
| NPLC              | `:SENSe:<fn>:NPLC <n>` (0.02, 0.2, 1, 10, 100)                            |
| AutoZero          | `:SENSe:<fn>:ZERO:AUTO ON\|OFF\|ONCE`                                     |
| Math function     | `:CALCulate:FUNCtion NULL\|DB\|DBM\|AVERage\|LIMit`                       |
| Math enable       | `:CALCulate:STATe ON\|OFF`                                                |
| Null offset       | `:CALCulate:NULL:OFFSet <v>` (plus `:ACQuire` to snap the offset)         |
| dBm reference Ω   | `:CALCulate:DBM:REFerence <r>` (50 / 75 / 600 typical)                    |
| Statistics fetch  | `:CALCulate:AVERage:MINimum? / MAXimum? / AVERage? / SDEViation? / COUNt?`|
| Limits            | `:CALCulate:LIMit:UPPer <v>` / `:LOWer <v>`                               |
| Trigger source    | `:TRIGger:SOURce IMMediate\|EXTernal\|BUS`                                |
| Trigger slope     | `:TRIGger:SLOPe POSitive\|NEGative`                                       |
| Trigger delay     | `:TRIGger:DELay <s>` (or `:AUTO ON` for "settle-then-measure")            |
| Sample count      | `:SAMPle:COUNt <n>`                                                       |
| Buffered read     | `:INITiate` → `:FETCh?` / `:DATA:POINts?` / `:DATA:REMove? <n>`           |
| Temperature unit  | `:UNIT:TEMPerature C\|F\|K`                                               |
| Temperature probe | `:SENSe:TEMPerature:TRANsducer RTD\|THERmocouple\|THERmistor`             |
| Save / recall     | `*SAV <n>` / `*RCL <n>` or `:MEMory:STATe:RECall <n>`                     |

## Hardware reality — Rigol DM858

From the Rigol DM858 datasheet and programming guide:

- **5½ digits**, 11 measurement functions: DCV, ACV, DCI, ACI, 2-wire and
  **4-wire** resistance, Frequency, Period, Capacitance, Continuity,
  Diode, **Temperature** (RTD + thermocouple sensors).
- **Math** block includes `NULL`, `dB`, `dBm`, `MIN`, `MAX`, `AVERage`,
  and `LIMit` (pass/fail).
- **Trigger** via `:TRIGger:SOURce` (immediate / external / bus /
  software), configurable `OUTPut:TRIGger:SLOPe` for the rear trigger-out.
- **Sample / trigger counts** for buffered acquisition and `FETCh?` /
  `DATA:POINts?` retrieval — this is what our "trend logger" UI rides on.
- **Temperature configuration** exposes `:UNIT:TEMPerature C|F|K` plus
  sensor-type selection.
- **Store / recall** state via the common `*SAV` / `*RCL` family.

What the DM858 does **not** have (keep in mind when we draw the UI):
segmented memory, digitize mode with sample rates above ~50 kS/s, direct
dBm source impedance list beyond the standard {50, 75, 600}.

## Scope of this step

### Facade additions (all optional)

```ts
export interface MultimeterRange {
  readonly label: string;       // "10 V", "100 mA", "10 MΩ"
  readonly upper: number;       // upper limit in base units (V / A / Ω / F / Hz)
  readonly resolution?: number; // preferred resolution for this range
}

export interface MultimeterRangingCapability {
  readonly modes: readonly MultimeterMode[];
  readonly ranges: Readonly<Record<MultimeterMode, readonly MultimeterRange[]>>;
  readonly nplc: readonly number[];     // e.g. [0.02, 0.2, 1, 10, 100]
  readonly autoZero: boolean;           // driver supports AutoZero ON/OFF/ONCE
}

export type MultimeterMathFunction =
  | "none" | "null" | "db" | "dbm" | "stats" | "limit";

export interface MultimeterMathCapability {
  readonly functions: readonly MultimeterMathFunction[];
  /** Per-function list of modes where it's permitted (e.g. dBm is usually VAC/VDC only). */
  readonly allowedModes: Readonly<Record<MultimeterMathFunction, readonly MultimeterMode[]>>;
  readonly dbmReferences: readonly number[];   // ohms
}

export interface MultimeterLoggingCapability {
  readonly maxSamples: number;      // driver's buffer depth (e.g. 1e6)
  readonly minIntervalMs: number;   // fastest sample pacing the driver can reliably deliver
}

export type MultimeterTriggerSource = "immediate" | "external" | "bus" | "software";
export type MultimeterTriggerSlope = "positive" | "negative";

export interface MultimeterTriggerCapability {
  readonly sources: readonly MultimeterTriggerSource[];
  readonly slopes: readonly MultimeterTriggerSlope[];
  readonly sampleCountRange: { min: number; max: number };
  readonly delayRangeSec: { min: number; max: number };
}

export type TemperatureUnit = "celsius" | "fahrenheit" | "kelvin";
export type TemperatureTransducer =
  | "pt100" | "pt1000" | "thermocouple-k" | "thermocouple-j"
  | "thermocouple-t" | "thermocouple-e" | "thermistor";

export interface MultimeterTemperatureCapability {
  readonly units: readonly TemperatureUnit[];
  readonly transducers: readonly TemperatureTransducer[];
}

export interface MultimeterDualDisplayCapability {
  /** Which secondary readouts are compatible with each primary mode. */
  readonly pairs: Readonly<Record<MultimeterMode, readonly MultimeterMode[]>>;
}
```

Methods (all optional, capability-gated on the server side):

- `getRange()` / `setRange(mode, upper | "auto")` / `getNplc()` / `setNplc(value)`
- `setAutoZero(mode: "on" | "off" | "once")`
- `getMath()` / `setMath(config: MultimeterMathConfig)` / `fetchMathState()`
- `startLogging(config)` / `stopLogging()` / `fetchLoggedSamples(since?)`
- `configureTrigger(config)` / `trigger()` (software trigger)
- `getTemperatureConfig()` / `setTemperatureConfig(config)`
- `setDualDisplay(secondary | null)` / `readDual()`
- `savePreset(slot)` / `recallPreset(slot)` / `getPresetCatalog()` —
  reuse of the preset shape from 2.5 (consolidated; see follow-ups).

### REST surface (additions)

- `GET  /api/sessions/:id/dmm/ranging` — returns capability + current.
- `POST /api/sessions/:id/dmm/ranging` — body `{ mode?, range?, nplc?, autoZero? }`.
- `GET  /api/sessions/:id/dmm/math` / `POST …/math`.
- `GET  /api/sessions/:id/dmm/logging` — status + latest chunk metadata.
- `POST /api/sessions/:id/dmm/logging/start` / `…/stop`.
- `GET  /api/sessions/:id/dmm/logging/samples?since=<seq>` — paged NDJSON.
- `GET  /api/sessions/:id/dmm/trigger` / `POST …/trigger`.
- `POST /api/sessions/:id/dmm/trigger/fire` — software trigger.
- `GET  /api/sessions/:id/dmm/temperature` / `POST …/temperature`.
- `GET  /api/sessions/:id/dmm/dual` / `POST …/dual`.
- `GET  /api/sessions/:id/dmm/presets` / save / recall (matches 2.5 shape).

Capability-missing routes return `supported: false` on GET and `409` on
mutating POSTs, exactly like 2.5.

### UI additions on the DMM detail page

Laid out as cards so sections hide cleanly when unsupported:

- **Range & integration** card — mode-aware manual-range picker with an
  explicit **Auto** option, NPLC chip bar (0.02 … 100), AutoZero tri-state
  button (On / Off / Once).
- **Math** card — function selector (Null / dB / dBm / Stats / Limit),
  context-appropriate inputs (null offset with "snap current reading"
  button, dBm reference Ω drop-down, upper/lower limit fields with a live
  pass / fail / in-range badge, min/max/avg/stddev/count readouts with a
  reset button).
- **Trend recorder** card — interval + total-samples inputs, start / stop,
  live uPlot sparkline with last-N-samples window, CSV export. Emits
  `measurementSample` events on the 5.1 bus (when Epic 5 ships) so the
  reading flows into the timeline automatically.
- **Trigger** card — source (Imm / Ext / Bus / Software), slope (when
  Ext), delay, sample count, a "Fire software trigger" button.
- **Temperature** sub-card — only shown when the current mode is
  `temperature`; unit chips (°C / °F / K) and a transducer drop-down.
- **Dual display** strip — toggles on, secondary drop-down filtered to
  `pairs[currentMode]`; shows a smaller secondary reading under the
  primary.
- **Presets** — same 10-slot grid component as 2.5's PSU presets.

All dynamic readouts stay inside `aria-live="polite"` regions (matches
the 2.3 / 2.4 accessibility rules).

## Acceptance criteria

- [ ] `IMultimeter` gains optional `ranging`, `math`, `logging`,
      `triggering`, `temperature`, `dualDisplay`, `presets` capabilities
      plus matching optional methods. Non-supporting drivers keep
      working unchanged (the core facade surface is backwards compatible).
- [ ] `MultimeterMode` gains `fourWireResistance`; existing drivers that
      don't list it are unaffected.
- [ ] `RigolDm858` advertises all applicable capabilities with ranges,
      NPLC options, math functions, transducers, and preset slot count
      drawn from the DM858 programming guide.
- [ ] REST endpoints advertise a capability descriptor on GET, validate
      bodies (400 for bad input, 409 for unsupported), and forward to
      the driver. Trend-logger endpoints stream samples via NDJSON and
      support `since=<seq>` continuation.
- [ ] DMM detail page hides each control cleanly when unsupported; the
      new cards live under the existing primary reading area.
- [ ] Math card renders a visible pass/fail/in-range badge when Limit is
      active, and a reset button for Stats.
- [ ] Trend recorder's sparkline respects `prefers-reduced-motion`, and
      CSV export carries wall-clock + elapsed-ms columns.
- [ ] Unit tests cover the driver SCPI for each new capability, including
      range clamping, NPLC round-tripping, null-offset snap, dBm reference
      write, buffered `:INITiate` + `:FETCh?` flow, temperature
      unit/transducer round-trip, and preset save/recall.
- [ ] Integration tests cover the new REST routes — capability
      advertising, input validation, NDJSON streaming, and SCPI
      side-effects against a fake port.

## Notes and follow-ups

- **Consolidate preset shape.** The PSU preset capability in 2.5 and the
  DMM preset capability here describe the same thing. Promote them to a
  shared `InstrumentPresetCapability` in `@lxi-web/core`; the PSU
  implementation stays the compatibility baseline so 2.5 code keeps
  working.
- **Trend recorder + Epic 5.** When 5.1's event bus lands, the trend
  recorder should emit `measurementSample` events so the 5.4 timeline
  can render DMM + PSU + scope on a single axis without duplicate
  pollers. Until then it runs a dedicated polling loop.
- **AutoZero ONCE** is a pulse semantic (no persistent state). The UI
  button should spring back to Off after firing.
- **4-wire resistance** requires wiring guidance in the UI (there's no
  way to detect it remotely); show a non-blocking hint the first time
  someone selects the mode.
- Deferred for a future 2.6 follow-up: frequency-measurement aperture
  (`:SENSe:FREQuency:APERture`), explicit digitize mode, and per-range
  bandwidth setting for ACV / ACI.
