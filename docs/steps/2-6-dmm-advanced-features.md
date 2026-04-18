# 2.6 — DMM advanced features (overview)

## Goal

Extend `IMultimeter` with **optional capability objects** (same pattern as
2.5 on `IPowerSupply`) so drivers can advertise the advanced DMM features
that the DM858 actually has — manual range, NPLC, math (null / dB / dBm /
statistics / pass-fail), dual display, trend logging, triggering, and
temperature — without forcing those features on other vendors.

2.6 is **sliced into three sub-steps** so each can ship independently with
its own commit, tests, and UI surface:

| Sub-step  | Slice                                                    | Step doc |
| --------- | -------------------------------------------------------- | -------- |
| **2.6a**  | Range, NPLC, AutoZero, triggering, 4-wire resistance      | [2-6a](./2-6a-dmm-range-and-triggering.md) |
| **2.6b**  | Math (null / dB / dBm / stats / limit) and dual display   | [2-6b](./2-6b-dmm-math-and-dual-display.md) |
| **2.6c**  | Trend logging, temperature, preset memory                 | [2-6c](./2-6c-dmm-logging-and-temperature.md) |

Each sub-step pulls its background from this overview rather than
duplicating the research.

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

## Cross-cutting notes

- **Consolidate preset shape.** The PSU preset capability in 2.5 and the
  DMM preset capability here (2.6c) describe the same thing. Promote them
  to a shared `InstrumentPresetCapability` in `@lxi-web/core`; the PSU
  implementation stays the compatibility baseline so 2.5 code keeps
  working. Tracked in `progress.md` under "Shared capability follow-ups".
- **Trend recorder + Epic 5.** When 5.1's event bus lands, 2.6c's trend
  recorder should emit `measurementSample` events so the 5.4 timeline
  can render DMM + PSU + scope on a single axis without duplicate
  pollers. Until then it runs a dedicated polling loop.
- **`MultimeterMode` expansion.** 2.6a adds `fourWireResistance` to the
  mode enum; because every sub-step lands after that slice, 2.6b / 2.6c
  code can assume the new mode is available.
- **Accessibility.** All dynamic readouts introduced across 2.6a–c stay
  inside `aria-live="polite"` regions, matching the 2.3 / 2.4 rules.

## Deferred for 2.6 follow-ups

- Frequency-measurement aperture (`:SENSe:FREQuency:APERture`).
- Explicit digitize mode distinct from the buffered trend logger.
- Per-range ACV / ACI bandwidth setting (`:SENSe:VOLTage:AC:BANDwidth`).

These are tracked in `progress.md` under "Advanced DMM features (extends
2.6)".
