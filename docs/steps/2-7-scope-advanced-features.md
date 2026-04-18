# 2.7 — Oscilloscope advanced features (overview)

## Goal

Extend `IOscilloscope` with **optional capability objects** so drivers
can expose the feature set bench operators actually reach for on a modern
scope: multiple trigger types, acquisition modes (average / peak-detect /
high-resolution), automatic measurements with statistics, cursors, math
(including FFT), reference-waveform slots, protocol decoders
(I²C / SPI / UART / CAN / LIN), history / segmented capture, display
screenshot, and setup save / recall. All gated as capabilities so a
bargain USB scope can still expose the 2.4 surface and nothing else.

2.7 is **sliced into four sub-steps** so the front-panel coverage can
ship in focused, commit-sized pieces:

| Sub-step | Slice                                                      | Step doc |
| -------- | ---------------------------------------------------------- | -------- |
| **2.7a** | Capture control — trigger matrix + acquisition + memory    | [2-7a](./2-7a-scope-capture-control.md) |
| **2.7b** | Analysis — automatic measurements + cursors + math / FFT   | [2-7b](./2-7b-scope-analysis.md) |
| **2.7c** | Save & replay — references + history + screenshot + presets | [2-7c](./2-7c-scope-save-and-replay.md) |
| **2.7d** | Protocol decoders — I²C / SPI / UART / CAN / LIN with NDJSON | [2-7d](./2-7d-scope-protocol-decoders.md) |

Each sub-step pulls its background from this overview rather than
duplicating the research.

## Standards landscape

The IVI Foundation's **IVI-4.1 IviScope** class is the industry-standard
abstraction for LAN / USB oscilloscopes and supplies the vocabulary
here. Core groups, mostly universal across Keysight / R&S / Tek /
Rigol / Siglent:

- **Base IviScope** — channels, vertical range / offset / coupling /
  probe attenuation / bandwidth limit / invert, timebase (record-length
  + rate or seconds/div + position), single / continuous / stop,
  `InitiateAcquisition` + `AcquisitionStatus`.
- **Trigger types (extensions):** Edge, TV, Glitch, Width, Runt, AC-line.
  Rigol adds Pulse, Slope, Timeout, Window, Duration, Setup/Hold, Nth
  Edge, Delay, Pattern, and serial (I²C, SPI, UART, CAN, LIN).
- **TriggerModifier** — Auto / Normal / Single sweep mode.
- **SampleMode** — RealTime vs Equivalent-time.
- **AverageAcquisition** — averaging with user count.
- **PeakDetect**, **HighResolution** — scopes that offer these can
  advertise them.
- **WaveformMeasurement + MinMaxWaveform** — the "automatic
  measurements" list (Vpp, Vmax, Vmin, Vrms, frequency, period, rise /
  fall time, duty cycle, overshoot / preshoot, etc.).
- **AutoSetup** — `:AUToset` and friends.
- **ReferenceLevel** — configurable thresholds for timing measurements.

SCPI mapping common to all major vendors (exact spelling varies, but the
shape is portable):

| Concept             | SCPI pattern                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| Trigger sweep mode  | `:TRIGger:SWEep AUTO\|NORMal\|SINGle`                                          |
| Trigger type        | `:TRIGger:MODE EDGE\|PULSe\|RUNT\|SLOPe\|TIMeout\|WINDow\|VIDeo\|...`          |
| Edge source / slope | `:TRIGger:EDGE:SOURce CHANnel1 / :SLOPe POSitive\|NEGative\|RFALl`             |
| Trigger level       | `:TRIGger:EDGE:LEVel <v>` (varies per trigger type)                            |
| Trigger holdoff     | `:TRIGger:HOLDoff <s>`                                                         |
| Trigger coupling    | `:TRIGger:COUPling DC\|AC\|HFReject\|LFReject\|NREject`                        |
| Force trigger       | `:TFORce` (Rigol); `:TRIGger:FORCe` elsewhere                                  |
| Run / stop          | `:RUN` / `:STOP` / `:SINGle`                                                   |
| Acquire type        | `:ACQuire:TYPE NORMal\|AVERages\|PEAK\|HRES`                                   |
| Averages            | `:ACQuire:AVERages <n>`                                                        |
| Memory depth        | `:ACQuire:MDEPth AUTO\|1k\|10k\|100k\|1M\|10M\|25M`                            |
| Auto-setup          | `:AUToset` / `:AUToset:PEAK`                                                   |
| Measurement item    | `:MEASure:ITEM <name>[,<source>]?` — 40+ items                                 |
| Measurement stats   | `:MEASure:STATistic:ITEM? <name>[,<source>]`                                   |
| Math operator       | `:MATH:OPERator ADD\|SUBT\|MULT\|DIV\|FFT\|INTG\|DIFF\|SQRT\|LOG\|LN\|EXP\|ABS`|
| Math sources        | `:MATH:SOURce1 CHAN1` / `:MATH:SOURce2 CHAN2`                                  |
| FFT config          | `:MATH:FFT:WINDow RECT\|HANN\|HAMM\|BHA\|FLAT\|TRI` / `:SPAN` / `:CENTer`      |
| Reference waveform  | `:REFerence<N>:ENABle ON` + `:SOURce CHAN<n>` + `:CURRent` (save current)      |
| Cursors             | `:CURSor:MODE MANual\|TRACk\|AUTO` + `:AX`, `:AY`, `:BX`, `:BY`                |
| Bus decoder         | `:BUS<N>:MODE I2C\|SPI\|UART\|CAN\|LIN` + per-mode source / clock / polarity   |
| Screenshot          | `:DISPlay:DATA? BMP24\|PNG\|JPG` — IEEE binary block                           |
| Setup save / recall | `:STORage:SESSion:SAVE` / `:LOAD` or `*SAV` / `*RCL`                           |

## Hardware reality — Rigol DHO800 / DHO804

From the Rigol DHO800 datasheet and programming guide:

- **12-bit** vertical resolution, **1.25 GSa/s** real-time sample rate,
  **25 Mpts** memory depth, **1 000 000 wfms/s** capture rate in
  UltraAcquire, 4 analog channels (DHO804).
- **Trigger types:** Edge, Pulse, Slope, Video, Pattern, Duration,
  Timeout, Runt, Window, Delay, Setup/Hold, Nth Edge, and serial
  protocols **I²C, SPI, RS-232 / UART, CAN, LIN** included.
- **Trigger modifiers:** Auto / Normal / Single, `:TFORce` for force-fire.
- **Acquisition modes:** Normal, Average (2 – 65536), Peak Detect,
  **High Resolution** (enhanced effective bits via box-car averaging).
- **Memory depth** selectable from Auto through 25 Mpts.
- **Math operators:** A+B, A−B, A×B, A÷B, FFT, Integrate, Differentiate,
  Sqrt, Log, Ln, Exp, Abs, logic (AND / OR / XOR / NOT) across digital
  options.
- **Automatic measurements:** 41 items covering time-domain (period,
  frequency, rise / fall, widths, duty, delay, phase), voltage
  (Vmax, Vmin, Vpp, Vtop, Vbase, Vamp, Vupper, Vmid, Vlower, Vavg, Vrms,
  overshoot, preshoot), and other derived numbers, each queryable via
  `:MEASure:ITEM? <name>,<source>` with a statistics variant
  (`:MEASure:STATistic:ITEM? <name>,<source>`).
- **Cursors:** Manual / Track / Auto; X, Y, and X-Y readouts.
- **Reference waveforms:** 10 slots, each capable of saving the current
  channel, showing / hiding, and resetting.
- **History / sequence** mode with frame navigation.
- **Pass / fail mask testing** (deferred to a 2.7 follow-up — complex UI).
- **Display image** via `:DISPlay:DATA?` (PNG / BMP24 / JPG).
- **Setup** save / recall via `:STORage` / `*SAV` / `*RCL`.

What the DHO804 does **not** have (keep in mind):
- LXI Extended Functions — no wired trigger bus, no PTP (see Epic 5.5).
- External sample clock / reference (higher-end DHO4000 only).
- True hardware segmented memory separate from history mode.

## Shared facade additions

Some shared field additions apply across all four sub-steps and land
with whichever slice touches them first:

```ts
export interface OscilloscopeChannelState {
  // 2.4 fields remain:
  readonly id: number; readonly label: string; readonly enabled: boolean;
  readonly scale: number; readonly offset: number;
  readonly coupling: OscilloscopeCoupling; readonly probeAttenuation: number;
  // 2.7 additions (optional, landed incrementally):
  readonly bandwidthLimit?: "off" | "20M" | "100M" | "200M";
  readonly invert?: boolean;
  readonly unit?: "V" | "A";                 // for current probes
}
```

2.7a is the natural home for `bandwidthLimit`, `invert`, and `unit`
because they live alongside the acquisition and coupling surface already
surfaced there.

## Cross-cutting notes

- **Tab strip over panel stack.** The new controls land as **tabs** on
  the existing 2.4 scope side column so the hero uPlot keeps its real
  estate. Each sub-step adds one or more tabs; all tabs are hidden
  when their backing capability is absent.
- **Capability gating everywhere.** Each sub-step's UI uses a
  `v-if="capability"` guard so drivers without that family produce no
  empty UI.
- **Consolidate preset shape.** 2.5 / 2.6c / 2.7c all want the same
  `InstrumentPresetCapability`. 2.6c introduces the shared type;
  2.7c is the third consumer.
- **Waveform streaming and the timeline (5.4).** `readWaveform` stays
  the authoritative scope-data path. History frames (2.7c) reference
  capture ids the way 5.1's notes anticipate; the UltraAcquire
  firehose is **not** replayed over the event bus.
- **Accessibility.** Tab strip uses roving tab-index; all dynamic
  numeric readouts stay inside `aria-live="polite"` regions; any
  animated transitions respect `prefers-reduced-motion`.

## Deferred for 2.7 follow-ups

- **Pass / fail mask testing** — mask editor + `:MASK:*` wiring.
- **Zone trigger** — on-plot region editor + `:TRIGger:ZONE:*`.
- **Digital / logic channels** — DHO804's MSO option exposed as
  `"digital"` kinds in `getChannels`.
- **Protocol-decoder waterfall view** — richer than the plain packet
  list from 2.7d.
- **Reference-level thresholds** — `:MEASure:SETup:MAX / MID / MIN`
  to tune rise / fall / overshoot definitions.

These are tracked in `progress.md` under "Advanced scope features
(extends 2.7)".
