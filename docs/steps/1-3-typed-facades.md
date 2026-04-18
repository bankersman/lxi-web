# 1.3 — Typed façades

## Goal

Narrow TypeScript interfaces per device class, implemented by composition over a `ScpiPort`.

## Acceptance criteria

- [x] `IOscilloscope`: identity, channels, timebase, single capture, waveform read.
- [x] `IPowerSupply`: channel list, set/readback voltage and current, output toggle.
- [x] `IMultimeter`: mode list, active mode, primary reading.
- [x] Each façade accepts a `ScpiPort` (transport-agnostic) so it is testable without sockets. _Enforced via the `DriverEntry.create(port, identity)` signature in the registry; concrete drivers land in 1.4._

## Notes

- Facades expose only what the dashboard actually needs; they are not full SCPI bindings.
