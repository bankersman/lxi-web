# Oscilloscope panel

Verified driver: **Rigol DHO804**. Other LXI scopes that identify
themselves through `*IDN?` but lack a typed driver fall back to the
raw SCPI console.

## Section order

1. **Overview card** — identity, status, quick actions.
2. **Channels + waveform** — hero uPlot chart, per-channel controls
   (coupling, probe, bandwidth, invert, offset).
3. **Acquisition / trigger** — sample rate, memory depth, edge /
   pulse / slope / video / pattern triggers.
4. **References / measurements / math** — the standard sets plus FFT.
5. **Display / cursors** — persistence, grid, manual cursors.
6. **Capture / history** — screenshot export and history navigation.
7. **Presets + decoders** — recallable capture setups and serial
   decoders (when the scope supports them).
8. **Raw SCPI** — always available as a collapsible at the bottom.

## Waveform export

Use the **Download** button in the waveform header for a CSV of the
current trace. The exported CSV has a timestamp column plus one
column per enabled channel.

## Screenshots

The **Capture** section exports PNG / BMP / TIFF depending on the
instrument's `:DISP:DATA?` support. Files go through the browser's
normal download path; the server does not retain them.
