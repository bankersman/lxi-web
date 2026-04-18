# Spectrum analyzer panel

Verified driver: **Siglent SSA3000X / SSA3000X-R**, covering
`SSA3015X`, `SSA3021X`, `SSA3032X`, and `SSA3050X` (with and without the
tracking-generator `-R` suffix). Rigol RSA3000 series and Keysight N9320B
announce their IDN in the simulator today; full drivers land in Epic 4.6
(Siglent vendor pack refinements) and 4.7 (Keysight).

## Section order

1. **Overview card** — identity, connection status, quick actions.
2. **Trace hero** — live SVG trace of the currently-enabled primary trace.
   Driven by the WebSocket `sa.trace` topic (2 s cadence by default).
   Y-axis auto-ranges with a 1 dB headroom pad. The panel annotates the
   start / stop frequency and the peak amplitude / frequency it found in
   the most recent sweep.
3. **Frequency card** — center / span inputs. The driver validates against
   the profile frequency ceiling (e.g. 3.2 GHz on `SSA3032X`); a 10 GHz
   request on a 3.2 GHz box is rejected with a 400 before any SCPI is
   sent. Start / stop input is accepted by the REST API too (`kind:
   "startStop"`) but the UI exposes center / span because it matches the
   instrument's normal operating mode.
4. **Reference & resolution card** — reference level in dBm, RBW in Hz.
   Setting RBW disables RBW auto-mode; the auto flag is restored by the
   Bandwidth POST when `autoRbw: true` is passed.
5. **Sweep card** — points (clamped to the profile maximum, typically
   751), read-only continuous flag. Use *Single sweep* to trigger a
   one-shot acquisition without switching continuous off.
6. **Markers card** — lists every enabled marker with its readout. *Peak
   search* drops M1 on the current trace peak by enabling M1 then sending
   `:CALCulate:MARKer1:MAXimum`.

## Live data and capability gating

The dashboard card (`SaMiniPanel`) subscribes to `sa.trace` and
`sa.markers` and renders a compact sparkline + peak / M1 summary. The
detail panel uses both topics, plus a one-shot `GET /sa/state` call on
mount and after each POST, to keep inputs in sync with the instrument.

Capabilities are advertised by the driver profile and mirrored into the
state payload. Buttons are disabled when the session is not `connected`,
and the driver refuses calls that the profile doesn't support — e.g.
`POST /sa/input { preampEnabled: true }` returns a 400 when the SKU has
no preamp.

## Channel power, trigger, averaging, limit lines

These capabilities are plumbed end-to-end in the REST layer
(`GET/POST /sa/channel-power`, `/sa/trigger`, `/sa/averaging`,
`/sa/limit-lines`) and the driver honours them on the SSA3000X, but the
UI surfaces them only through the Raw SCPI console today. The
tabbed controls land alongside the uPlot trace upgrade in a follow-up
step — see the 4.5 tracker in `docs/steps/4-5-spectrum-analyzer.md`.

## Tracking generator

SSA3000X-R variants report `hasTrackingGenerator: true` on the profile.
A dedicated TG sub-capability (output level control, sweep + TG
synchronisation) is deliberately out of scope for 4.5 and tracked as a
follow-up backlog item; 4.5 advertises the presence so the UI can flag
affected SKUs in the hardware matrix (Epic 4.9).

## Safety notes

- The ref level is clamped to the profile range (`-100 dBm`…`30 dBm`) on
  the facade; do not bypass this by sending raw SCPI. Driving the front
  end with `+30 dBm` at too low an attenuator will damage the first
  mixer.
- Preamp gain, when present, is only valid inside the profile's
  frequency window (`100 kHz … f_max`). The driver validates the freq
  window before toggling the preamp to avoid spurs from an out-of-band
  gain stage.
- CSV trace transfer is ASCII on the SSA; very large point counts take a
  perceptible time. The scheduler caps `sa.trace` at 2 s so a single
  slow sweep can't queue up behind itself.

## Supported SKUs

- **Siglent** — SSA3015X, SSA3015X-R, SSA3021X, SSA3021X-R, SSA3032X,
  SSA3032X-R, SSA3050X, SSA3050X-R. All verified against the simulator;
  hardware verification for individual SKUs lands in the 4.9 matrix.
- **Rigol RSA3000 / Keysight N9320B** — IDN patterns reserved by the
  simulator; drivers arrive in 4.6 (Rigol RSA polish) and 4.7 (Keysight
  vendor pack). Attempts to open a session today route through the
  generic unknown driver and get the Raw SCPI console.
