# 2.4 — Per-session detail views

## Goal

Card mini-controls and full expanded device workspaces.

## Acceptance criteria

- [x] Card compact controls:
  - Scope: "Single capture" button + last-capture timestamp.
  - PSU: per-channel output toggle + summary V/I readback (polled 2s).
  - DMM: mode badge + primary reading (polled 1s).
  - Unknown: status only (falls through to raw console on detail page).
- [x] Expanded `/device/:sessionId` workspace:
  - Scope: hero uPlot waveform, side panel with channels + timebase + capture.
  - PSU: per-channel cards for set/readback and enable.
  - DMM: mode selector + large primary reading + small history (last 20).
  - Unknown: raw SCPI console (send, reply, warnings).
- [x] Live updates: session lifecycle flows through Pinia/WebSocket; instrument
  readouts poll via `usePolling` and surface in `aria-live="polite"` regions.
- [x] CSV export on scope captures; sampled data table below the chart for a11y.
- [x] Raw SCPI console is always available via an expandable details panel on
  typed device pages, and is the primary affordance for unknown devices.
