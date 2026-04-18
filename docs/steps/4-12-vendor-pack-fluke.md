# 4.12 — Vendor pack: Fluke

## Goal

Add support for popular **Fluke** LXI-enabled instruments. Fluke's LXI
presence is narrow: a handful of bench DMMs and calibrators, no scopes, no
AWGs, no spectrum analyzers. Treat this pack as a **DMM-centric** vendor
pack with an optional calibrator sub-lane, and be explicit that anything
outside the bench-instrument catalogue (ScopeMeter handhelds, process
tools, clamp meters) is out of scope until a specific LXI-enabled SKU
surfaces through a community report.

Ships as **Preview** in the 4.9 matrix; promote once a contributor reports
real hardware.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md), [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md) — sister vendor packs (DMM reference).
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — supported-hardware surface.

## Target instruments

### Multimeter — 8000 / 8800 bench range (primary target)

- **8808A / 8845A / 8846A** — 5½ / 6½-digit bench DMMs with LXI.
- **8588A** — 8½-digit reference-grade bench DMM (metrology focus).
- **8508A** — 8½-digit reference DMM (GPIB + LAN adapter).

SCPI notes:

- Mostly IEEE 488.2-clean, but Fluke firmware is older and occasionally
  expects *CR+LF* termination rather than LF. `TcpTransport` already
  supports both; confirm per-model.
- `CONFigure:*`, `SENSe:FUNCtion`, `SENSe:<func>:RANGe`,
  `SENSe:<func>:NPLC`, `CALCulate:FUNCtion NULL|DB|DBM|AVERage|LIMit`
  mostly match IVI-4.8, but `CALCulate:AVERage` has a longer aperture
  argument list on 8846A than the DM858 reference driver.
- Some older Fluke firmware accepts the legacy `*ID?` alongside `*IDN?`;
  tolerate either in the manufacturer regex path.
- 8808A has a reduced feature set (no dual display, no math limit mode)
  — profile-gate to avoid advertising capabilities that `-113` the
  device.

### Calibrator — 5xxx / 55xx / 57xx (optional sub-scope)

- **5520A / 5522A / 5730A** — multi-function calibrators. These output
  precise V / I / R / F / Z signals; exposing them as a specialised
  "PSU-like" façade gives the UI a basic panel. Advanced calibration
  procedures (multi-stage sequences, artefact calibration) explicitly
  out of scope.
- Fluke 55xx / 57xx expose `OUTPut`, `SOURce:VOLT`, `SOURce:CURR`,
  `SOURce:FREQ` — they fit the `IPowerSupply` façade with a narrower
  capability set and an "output is regulated / compliance / tripped"
  state machine.

Flag calibrators as an optional second pass; the DMM driver is the
minimum viable pack.

### ScopeMeter / 289 / 87V / handheld

Explicitly **out of scope** for this pack. Fluke handhelds use Fluke
Connect (Bluetooth / USB) rather than LXI / raw TCP SCPI. Do not pretend
otherwise.

## Driver plan

- New `drivers/fluke/` package with `_shared/` helpers (CR+LF tolerance,
  `*ID?` legacy query fallback).
- Manufacturer regex: `/fluke/i`.
- Primary driver `FlukeBenchDmm` (8808A / 8845A / 8846A / 8588A / 8508A)
  following the 4.2 pattern; per-variant profile carrying mode list,
  range list, NPLC list, math/dual-display toggles, and a
  `needsCrlf: boolean` hint.
- Optional `FlukeCalibrator` (5520A / 5522A / 5730A) driver with a
  reduced `IPowerSupply` shape (output V / I / F, compliance readback,
  trip clear).
- Registry: per-variant + catch-all per family, longest-name-first.
- `refineBenchDmmProfile` probes `SYSTem:OPTion?` to enable dual-display
  / math on variants that advertise the option.

## Simulator plan

- `fluke-8845a`, `fluke-8846a`, `fluke-8588a` DMM personalities covering
  representative variants (5½-digit, 6½-digit, reference).
- Optional `fluke-5522a` calibrator personality if the calibrator lane
  lands in this step.
- Exercise CR+LF termination against the simulator in at least one
  personality fixture to verify transport tolerance.

## Acceptance criteria

- [ ] Profile-driven driver `FlukeBenchDmm` covers the 8000 / 8800
      bench-range variant table.
- [ ] Manufacturer regex resolves `Fluke` / `FLUKE` IDN strings; legacy
      `*ID?` responder is tolerated.
- [ ] CR+LF termination path is covered in a `TcpTransport` /
      `ScpiSession` integration test using a Fluke-style simulator
      personality.
- [ ] Simulator personalities for the representative variants round-trip
      core DMM commands against the new driver.
- [ ] `refineBenchDmmProfile` narrows dual-display / math on variants
      that don't advertise the option.
- [ ] All Fluke rows land in `docs/user/supported-hardware.md` with
      **Preview** status.
- [ ] New `packages/core/test/fluke-profiles.test.ts` iterates every
      variant and exercises the refiner + manufacturer-regex tolerance.
- [ ] Extensions in `packages/sim/test/integration.test.ts` cover each
      new personality.
- [ ] Calibrator sub-lane: either full `FlukeCalibrator` driver lands with
      corresponding sim + tests + docs, or it's explicitly deferred in
      the step notes with a tracking backlog entry.

## Notes

- The Fluke pack is intentionally narrow. Do not over-invest — there are
  only a handful of LXI-enabled Fluke bench SKUs, and handhelds are
  firmly in Fluke Connect / USB territory.
- Fluke 8588A / 8508A are metrology-grade instruments; treat NPLC / guard
  / 4-wire settings with care and don't expose experimental capabilities
  on them.
- The calibrator façade shape is a judgment call — framing it as
  `IPowerSupply` keeps UI work cheap, but a real `ICalibrator` façade
  might make sense if demand surfaces. Log this trade-off in the step
  outcome.
