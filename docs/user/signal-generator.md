# Signal generator panel

Verified drivers: **Rigol DG811 / DG812 / DG821 / DG822 / DG831 / DG832**
(DG800 series) and **Rigol DG922 / DG932 / DG952 / DG972** (DG900 series).
Siglent SDG and Keysight 33500B variants announce their IDN in the
simulator today and get full drivers in 4.6 / 4.7.

## Section order

1. **Overview card** — identity, status, quick actions.
2. **Per-channel hero** — large frequency / amplitude / offset readouts
   live-updated over the WebSocket `sg.channels` topic, with
   `aria-live="polite"` so screen readers announce changes.
3. **Waveform form** — type selector (sine / square / ramp / pulse /
   noise / dc / arbitrary) driving a type-aware subform:
   - `square` → `dutyPct`,
   - `ramp` → `symmetryPct`,
   - `pulse` → `widthS` (plus optional `riseTimeS` / `fallTimeS` through
     the REST API).
4. **Impedance buttons** — `50 Ω` vs. `Hi-Z`. Getting this wrong doubles
   or halves every displayed amplitude, so the control is always
   visible.
5. **Capabilities summary** — advertises the modulation / sweep / burst
   / arbitrary / sync / presets surface the driver exposes. Full
   sub-forms are reachable through the API helpers (`api.setSgModulation`,
   `api.setSgSweep`, `api.setSgBurst`, `api.uploadSgArbitrary`,
   `api.alignSgPhase`, `api.saveSgPreset`, ...).
6. **Raw SCPI** — collapsible at the bottom.

## Arbitrary waveform upload

Arbitrary waveforms are transferred as IEEE 488.2 definite-length
binary blocks through `writeBinary` on the SCPI session. The driver
converts a `Float32Array` in the range `[-1, 1]` into int16 DAC codes
before sending. The upload path is:

```text
:SOURceN:TRACe:DATA:DAC16 VOLATILE,END,<binary block>
:SOURceN:DATA:COPY <name>
```

The uploaded sample is registered on the driver and listed by
`listArbitrarySamples`. The Rigol hardware does not expose a stable
directory listing over SCPI, so the server keeps the list per session.

## Safety notes

- **Output enable** is a hard switch — each channel stays off until you
  toggle it.
- **Modulation / sweep / burst** are mutually exclusive on most
  hardware; the facade does *not* enforce that — the instrument surfaces
  errors through the SCPI error queue, which the dashboard shows.
- **Clock source** (`sync/common-clock`) changes affect both channels;
  pick the internal clock for single-instrument work and external when
  you are chaining multiple units.

## Supported SKUs

| Family | Model   | Channels | Max freq | Arbitrary depth | Notes                                         |
|--------|---------|----------|----------|-----------------|-----------------------------------------------|
| DG800  | DG811   | 1        | 10 MHz   | 16 Ksa          | Single-channel entry model.                   |
| DG800  | DG812   | 2        | 10 MHz   | 16 Ksa          | Default DG800 personality in the simulator.   |
| DG800  | DG821   | 1        | 25 MHz   | 16 Ksa          |                                               |
| DG800  | DG822   | 2        | 25 MHz   | 16 Ksa          |                                               |
| DG800  | DG831   | 1        | 35 MHz   | 16 Ksa          |                                               |
| DG800  | DG832   | 2        | 35 MHz   | 16 Ksa          |                                               |
| DG900  | DG922   | 2        | 25 MHz   | 16 Msa          |                                               |
| DG900  | DG932   | 2        | 35 MHz   | 16 Msa          | Default DG900 personality in the simulator.   |
| DG900  | DG952   | 2        | 50 MHz   | 16 Msa          |                                               |
| DG900  | DG972   | 2        | 70 MHz   | 16 Msa          |                                               |

Any `DG8xx` / `DG9xx` IDN not in the table falls back to the generic
DG800 / DG900 profile; the limits are clamped conservatively until a
variant-specific entry lands.
