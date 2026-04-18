# Power supply panel

Verified driver: **Rigol DP932E**. Other LXI PSUs fall back to raw SCPI.

## Section order

1. **Overview card** — identity, status, quick actions.
2. **Per-channel output + rails** — big V/I readouts, output toggle,
   set-point entry, instrument-reported limits.
3. **Pairing / tracking** — series / parallel pairing and tracking
   modes when the PSU supports them.
4. **Presets** — recallable output setups.
5. **Protection** — OVP / OCP / OTP thresholds and trip state.
6. **Raw SCPI** — collapsible at the bottom.

## Safety defaults

- **Output toggles** require an explicit click; the UI never arms
  outputs silently on page load.
- **Protection thresholds** are displayed in clearly coloured
  indicators; a tripped state shows a banner until acknowledged.
- **Presets** recall the entire output configuration atomically — the
  UI disables manual fields while a recall is in flight.
