# 2.7 — Oscilloscope advanced features

## Goal

Extend `IOscilloscope` with **optional capability objects** so drivers
can expose the feature set bench operators actually reach for on a modern
scope: multiple trigger types, acquisition modes (average / peak-detect /
high-resolution), automatic measurements with statistics, cursors, math
(including FFT), reference-waveform slots, protocol decoders
(I²C / SPI / UART / CAN / LIN), history / segmented capture, display
screenshot, and setup save / recall. All gated as capabilities so a
bargain USB scope can still expose the 2.4 surface and nothing else.

The current facade is "enable channels, set timebase, single-capture,
read waveform"; this step covers the rest of the front panel.

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
- **Pass / fail mask testing** (deferred to 2.7 follow-up — complex UI).
- **Display image** via `:DISPlay:DATA?` (PNG / BMP24 / JPG).
- **Setup** save / recall via `:STORage` / `*SAV` / `*RCL`.

What the DHO804 does **not** have (keep in mind):
- LXI Extended Functions — no wired trigger bus, no PTP (see Epic 5.5).
- External sample clock / reference (higher-end DHO4000 only).
- True hardware segmented memory separate from history mode.

## Scope of this step

### Facade additions (all optional)

```ts
export interface OscilloscopeChannelState {
  // 2.4 fields:
  readonly id: number; readonly label: string; readonly enabled: boolean;
  readonly scale: number; readonly offset: number;
  readonly coupling: OscilloscopeCoupling; readonly probeAttenuation: number;
  // 2.7 additions (all optional and initially backwards compatible):
  readonly bandwidthLimit?: "off" | "20M" | "100M" | "200M";
  readonly invert?: boolean;
  readonly unit?: "V" | "A";                 // for probe types
}

export type OscilloscopeTriggerType =
  | "edge" | "pulse" | "slope" | "video" | "pattern"
  | "duration" | "timeout" | "runt" | "window"
  | "delay" | "setupHold" | "nthEdge"
  | "i2c" | "spi" | "uart" | "can" | "lin";

export type OscilloscopeTriggerSweep = "auto" | "normal" | "single";
export type OscilloscopeTriggerSlope = "rising" | "falling" | "either";
export type OscilloscopeTriggerCoupling = "dc" | "ac" | "hfReject" | "lfReject" | "noiseReject";

export interface OscilloscopeTriggerCapability {
  readonly types: readonly OscilloscopeTriggerType[];
  readonly sources: readonly string[];       // "CHAN1" | "EXT" | "ACLine" | "D0" … "D15"
  readonly sweepModes: readonly OscilloscopeTriggerSweep[];
  readonly slopes: readonly OscilloscopeTriggerSlope[];
  readonly couplings: readonly OscilloscopeTriggerCoupling[];
  readonly holdoffRangeSec: { min: number; max: number };
}

export type OscilloscopeAcquisitionMode = "normal" | "average" | "peakDetect" | "highRes";
export interface OscilloscopeAcquisitionCapability {
  readonly modes: readonly OscilloscopeAcquisitionMode[];
  readonly averageRange: { min: number; max: number };   // e.g. { min: 2, max: 65536 }
  readonly memoryDepths: readonly (number | "auto")[];   // e.g. ["auto", 1_000, 10_000, ..., 25_000_000]
}

export interface OscilloscopeMeasurementItem {
  readonly id: string;                       // "vpp", "freq", "rtime"
  readonly label: string;                    // "Peak-Peak", "Frequency", "Rise Time"
  readonly unit: string;                     // "V", "Hz", "s"
  readonly category: "voltage" | "time" | "other";
}

export interface OscilloscopeMeasurementCapability {
  readonly items: readonly OscilloscopeMeasurementItem[];
  readonly statistics: boolean;              // supports :MEASure:STATistic:*
  readonly maxTracked: number;               // visible slots on screen (typical: 10)
}

export type OscilloscopeMathOperator =
  | "add" | "sub" | "mul" | "div" | "fft"
  | "integrate" | "differentiate" | "sqrt" | "log" | "ln" | "exp" | "abs"
  | "and" | "or" | "xor" | "not";

export type OscilloscopeFftWindow = "rect" | "hann" | "hamming" | "blackman" | "flatTop" | "triangle";

export interface OscilloscopeMathCapability {
  readonly operators: readonly OscilloscopeMathOperator[];
  readonly fftWindows: readonly OscilloscopeFftWindow[];
  readonly channels: number;                 // how many math traces (Rigol: 1)
}

export interface OscilloscopeReferenceCapability {
  readonly slots: number;                    // 10 on DHO800
  readonly supportsLabel: boolean;
}

export type OscilloscopeCursorMode = "off" | "manual" | "track" | "auto";
export interface OscilloscopeCursorCapability {
  readonly modes: readonly OscilloscopeCursorMode[];
  readonly tracksXandY: boolean;
}

export type OscilloscopeDecoderKind = "i2c" | "spi" | "uart" | "can" | "lin";
export interface OscilloscopeDecoderCapability {
  readonly buses: number;                    // how many concurrent buses (Rigol: 2)
  readonly kinds: readonly OscilloscopeDecoderKind[];
}

export interface OscilloscopeHistoryCapability {
  /** Maximum number of frames the instrument can buffer (roughly). */
  readonly maxFrames: number;
}

export interface OscilloscopeDisplayCapability {
  readonly screenshotFormats: readonly ("png" | "bmp" | "jpg")[];
  readonly persistenceModes: readonly ("off" | "infinite" | "1s" | "5s" | "10s")[];
}

export interface OscilloscopePresetCapability {
  readonly slots: number;                    // mirrors PSU / DMM preset shape
}
```

Methods, again all optional and capability-gated on the server side:

- Trigger: `getTrigger()`, `setTrigger(config)`, `forceTrigger()`,
  `setSweep(mode)`.
- Acquisition: `getAcquisition()`, `setAcquisition({ mode, averages?, mdepth? })`,
  `autoSetup()`.
- Measurements: `getMeasurements(sources, items)`,
  `clearStatistics()`.
- Math: `getMath()`, `setMath(config)`, `setMathVisible(enabled)`.
- References: `getReferenceSlots()`, `saveReference(slot, source)`,
  `showReference(slot, enabled)`, `clearReference(slot)`.
- Cursors: `getCursors()`, `setCursors(config)`.
- Decoders: `listBuses()`, `configureBus(busId, config)`,
  `getDecodedEvents(busId, { since? })`.
- History: `enableHistory(enabled)`, `getFrames()`, `seekFrame(n)`.
- Display: `screenshot(format)`, `setPersistence(mode)`.
- Presets: `getPresetCatalog()`, `savePreset(slot)`, `recallPreset(slot)`
  (shared shape with 2.5 / 2.6 — see follow-ups).

### REST surface (additions)

- `GET / POST /api/sessions/:id/scope/trigger` — capability + current
  config; POST validates per-type body shape.
- `POST /api/sessions/:id/scope/trigger/force`.
- `GET / POST /api/sessions/:id/scope/acquisition`.
- `POST /api/sessions/:id/scope/autoset`.
- `GET / POST /api/sessions/:id/scope/measurements` — GET returns the
  catalog + current active items + values + statistics.
- `GET / POST /api/sessions/:id/scope/math`.
- `GET /api/sessions/:id/scope/references` —
  `POST …/references/:slot/save|show|clear`.
- `GET / POST /api/sessions/:id/scope/cursors`.
- `GET /api/sessions/:id/scope/buses` — `POST …/buses/:id`.
- `GET /api/sessions/:id/scope/buses/:id/packets?since=<seq>` — NDJSON
  stream of decoded frames / packets.
- `GET / POST /api/sessions/:id/scope/history` — enable, frame list,
  seek.
- `GET /api/sessions/:id/scope/screenshot?format=png|bmp|jpg`.
- `GET /api/sessions/:id/scope/presets` / save / recall.

### UI additions on the scope detail page

The existing 2.4 layout (hero uPlot + side column) keeps its real
estate; new controls land as **tabs** on the side column so the plot
stays dominant:

- **Trigger** tab — sweep mode (Auto / Normal / Single), type picker,
  type-specific subform (edge source / slope / level / coupling;
  pulse polarity + width range; etc.), holdoff input, Force button.
- **Acquire** tab — mode selector, average count (only for Average),
  memory depth chips, Auto-Setup button with a "run with caution"
  confirm.
- **Measure** tab — table of active measurements with current value,
  min / max / avg / stddev / count when statistics are on, add / remove
  items from the catalog, clear-stats button.
- **Math** tab — operator picker, source channels, enable toggle,
  FFT sub-form (window, span, center) that only shows when the operator
  is `fft`.
- **Refs** tab — 10-slot grid: Save current / Show / Hide / Clear; each
  slot shows source label and a tiny thumbnail.
- **Cursors** tab — mode radio, manual X1/X2/Y1/Y2 inputs with paired
  readouts of Δ and 1/Δ (frequency-from-cursor).
- **Decoders** tab — bus1 / bus2 cards with protocol picker and the
  protocol-specific config (I²C: SCL/SDA, address width; SPI: CS /
  CLK / MOSI / MISO, clock edge; UART: baud / data bits / parity;
  CAN: baud + sample point; LIN: baud). Below: a virtualized list of
  recently decoded packets.
- **History** tab — scrubber + frame counter + play/pause; selecting
  a frame loads its waveform into the hero uPlot.
- **Display & Presets** tab — screenshot button (downloads the image),
  persistence picker, the 10-slot preset grid.

Every tab's content is behind a `v-if="capability"` guard so drivers
without that family produce no empty UI.

## Acceptance criteria

- [ ] `IOscilloscope` gains optional `trigger`, `acquisition`,
      `measurements`, `math`, `references`, `cursors`, `decoders`,
      `history`, `display`, and `presets` capabilities plus matching
      optional methods. Existing callers continue to work.
- [ ] `OscilloscopeChannelState` gains optional `bandwidthLimit`,
      `invert`, and `unit` fields (all optional so 2.4 code still type-
      checks).
- [ ] `RigolDho800` advertises all applicable capabilities with values
      drawn from the DHO800 programming guide (trigger types, 41
      measurement items, math operators, FFT windows, memory-depth
      list, 10 ref slots, screenshot formats, preset slot count).
- [ ] REST endpoints advertise a capability descriptor on GET, validate
      per-type payloads, return 409 on unsupported, and forward to the
      driver. Decoder endpoint supports NDJSON streaming with `since=<seq>`.
- [ ] Scope detail page's new tab strip hides tabs for unsupported
      capabilities; tab content stays keyboard-navigable (roving
      tab-index) and respects `prefers-reduced-motion`.
- [ ] Triggering: switching trigger type round-trips through the driver
      and the UI; Force fires `:TFORce`; Auto / Normal / Single toggle
      visibly changes the trigger-status indicator.
- [ ] Measurements: adding an item invokes the right `:MEASure:ITEM`
      query family; statistics toggle is atomic; clear-stats hits
      `:MEASure:STATistic:RESet`.
- [ ] Math: selecting FFT reveals window / span / center controls; the
      math trace overlays on the hero uPlot with a distinct color.
- [ ] Screenshot returns a well-formed binary for each advertised format
      (tested against the driver's IEEE block parser).
- [ ] Unit tests cover driver SCPI for trigger types (edge + at least
      one non-edge), acquisition modes incl. averaging, a representative
      measurement set, math operator + FFT config, reference slot save,
      cursor round-trip, one decoder configuration, history enable /
      seek, screenshot binary framing, and preset save / recall.
- [ ] Integration tests cover the new REST routes, capability gating,
      input validation, NDJSON decoder streaming, and screenshot content-
      type.

## Notes and follow-ups

- **Consolidate preset shape** (shared note with 2.6). Promote `slots:
  number` to a shared `InstrumentPresetCapability`; PSU, DMM, and
  scope each re-export it under their capability name.
- **Waveform streaming for the timeline (5.4).** `readWaveform` stays
  the authoritative path; the history tab's frames and the UltraAcquire
  firehose are **not** replayed over the event bus — they reference
  capture ids the way 5.1's notes anticipate.
- **Pass / fail mask testing** is deliberately out of scope for this
  step — the UI for drawing / editing masks is its own project and the
  value without a mask editor is limited. Track as a 2.7 follow-up.
- **Zone trigger** (DHO800 feature) is also deferred for the same reason
  — it needs a region editor overlaid on the plot.
- **Digital / logic analyzer channels** on DHO804 (optional hardware)
  would extend `getChannels` with `"digital"` kinds; schedule alongside
  the logic-capable vendor packs in V2.
- **Protocol decoder packet visualisation** is kept deliberately plain
  (virtualized list with bus-specific columns). A richer waterfall view
  is a natural V2 follow-up once users have opinions.
- **AutoSetup** can stomp on a carefully-tuned configuration. The UI
  confirm dialog explicitly lists "this may overwrite channel scales,
  trigger settings, and timebase" before issuing `:AUToset`.
