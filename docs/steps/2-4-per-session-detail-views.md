# 2.4 — Per-session detail views

## Goal

Card mini-controls and full expanded device workspaces.

## Acceptance criteria

- [ ] Card compact controls:
  - Scope: "Single capture" button + last-capture timestamp.
  - PSU: output toggle + summary V/I readback.
  - DMM: mode badge + primary reading.
  - Unknown: status only.
- [ ] Expanded `/device/:sessionId` workspace:
  - Scope: hero uPlot waveform, side panel with channels + timebase + capture.
  - PSU: per-channel cards for set/readback and enable.
  - DMM: mode selector + large primary reading + small history.
  - Unknown: raw SCPI console (send, reply, warnings).
- [ ] Live updates via WebSocket subscription; readouts in `aria-live="polite"` regions.
- [ ] CSV export on scope captures; data table alongside chart for a11y.
