# 1.4 — Vendor packs (Rigol)

## Goal

Implement the three façades for the actual gear in the lab:

- **Oscilloscope:** Rigol DHO804 (DHO800 family).
- **Power supply:** Rigol DP932E (DP900-class).
- **Multimeter:** Rigol DM858 (bench DMM).

## Acceptance criteria

- [ ] Registry patterns match these models even when firmware suffixes are appended to `*IDN?`.
- [ ] DHO804 façade: channels 1–4, timebase read/write, `:SING` single trigger, `:WAV:DATA?` waveform pipeline.
- [ ] DP932E façade: channels CH1–CH3, set/measure V+I, output toggle per channel.
- [ ] DM858 façade: mode switching (DCV/ACV/DCI/ACI/RES/FREQ/CAP) and primary measurement.

## Observed `*IDN?` strings (fill in when tested)

- DHO804: `RIGOL TECHNOLOGIES,DHO804,...`
- DP932E: `RIGOL TECHNOLOGIES,DP932E,...`
- DM858: `RIGOL TECHNOLOGIES,DM858,...`

Update with real values after hardware testing.
