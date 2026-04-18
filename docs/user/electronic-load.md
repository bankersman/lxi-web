# Electronic load panel

Verified drivers: **Rigol DL3021 / DL3031**. Other LXI loads fall back to
raw SCPI; Siglent SDL variants ship in the 4.6 vendor pack.

## Section order

1. **Overview card** — identity, status, quick actions.
2. **Hero strip** — large V / I / P / R readouts live-updated over the
   WebSocket `eload.state` topic, with `aria-live="polite"` so screen
   readers call out changes.
3. **Mode &amp; setpoints** — all four setpoints (CC / CV / CR / CP) are
   shown even when only one is active. Changing the active mode is a
   single click; the instrument switches immediately.
4. **Protection** — OVP / OCP / OPP / OTP enable + level + trip state.
   OTP is always on; its level is fixed in firmware.
5. **Dynamic** — A/B pulse loading with slew-rate control (DL3000 tops
   out at 2.5 A/µs). Start with a low pulse frequency — pulse loading a
   marginal supply is a quick way to turn your test bench into an
   oscillator.
6. **Battery** — constant-current / constant-resistance /
   constant-power discharge with voltage, capacity, and time cutoffs.
   Live elapsed time, removed capacity, and removed energy stream back
   from the load.
7. **Presets** — 10 `*SAV` / `*RCL` slots.
8. **Raw SCPI** — collapsible at the bottom.

## Safety notes

- **Input enable** is a hard switch — the load will not draw current
  until you toggle it.
- **Dynamic mode** carries subtle safety implications; the UI defaults
  intentionally use conservative dwell times.
- **CR range** varies wildly per model — the profile's
  `resistanceRange` is the source of truth. A setpoint you typed that
  works on a DL3031 may be out of range on a DL3021 and vice versa;
  the UI will reject out-of-range values server-side before the SCPI
  write.

## Supported SKUs

| Model    | V / I / P                   | Notes                                    |
|----------|-----------------------------|------------------------------------------|
| DL3021   | 150 V / 40 A / 200 W        | First shipping driver; fully profiled.   |
| DL3031   | 150 V / 60 A / 350 W        | Same SCPI dialect; higher power ceiling. |

The driver accepts any `DL30xx` IDN via its conservative catch-all
profile, so unreleased SKUs in the family still connect; actual limits
are clamped to the generic profile until a variant-specific entry
lands.
