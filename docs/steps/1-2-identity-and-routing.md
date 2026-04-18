# 1.2 — Identity and routing

## Goal

Parse `*IDN?` and route identified instruments to the right façade factory.

## Acceptance criteria

- [x] `parseIdn` splits `manufacturer, model, serial, firmware` from common `*IDN?` formats.
- [x] `DeviceKind` enum covers `oscilloscope | powerSupply | multimeter | unknown`.
- [x] `DriverRegistry` maps `(vendor, modelPattern)` → façade factory.
- [x] Unknown models still produce a live session with `kind: "unknown"` and raw SCPI access (no hard reject). _Registry returns `null`; callers keep the `ScpiPort` for raw SCPI._

## Notes

- Model patterns use case-insensitive `RegExp`/substring match; firmware suffixes must not break the match.
- Real `*IDN?` strings observed during testing belong in [1-4-vendor-packs-rigol.md](1-4-vendor-packs-rigol.md).
