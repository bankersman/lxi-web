# 1.3 — Typed façades

## Goal

Narrow TypeScript interfaces per device class, implemented by composition over a `ScpiPort`.

## Acceptance criteria

- [ ] `IOscilloscope`: identity, channels, timebase, single capture, waveform read.
- [ ] `IPowerSupply`: channel list, set/readback voltage and current, output toggle.
- [ ] `IMultimeter`: mode list, active mode, primary reading.
- [ ] Each façade accepts a `ScpiPort` (transport-agnostic) so it is testable without sockets.

## Notes

- Facades expose only what the dashboard actually needs; they are not full SCPI bindings.
