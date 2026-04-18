# 4.8 — Vendor pack: Owon

## Goal

Add support for popular **Owon** LXI-enabled instruments. Owon's LXI
conformance is **inconsistent** — many of their benchtop instruments speak
SCPI over raw TCP on non-standard ports, skip `_lxi._tcp` advertisement
entirely, and often only implement a minimal SCPI subset compared to their
Rigol / Siglent / Keysight equivalents. This pack is therefore the
**smallest-scoped** of the three vendor packs: cover the common-case benches
(DMM, PSU, single entry-level scope), document the gaps clearly, and rely
even more heavily on simulator personalities + community hardware reports.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md), [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md) — sister vendor packs.
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — supported-hardware surface.

## Target instruments

### Multimeter — XDM range (primary target)

- **XDM1041** (4½-digit, LXI variant).
- **XDM1241** (4½-digit, upgraded memory).
- **XDM2041** (5½-digit LXI bench DMM).
- **XDM3041 / XDM3051** (higher-tier variants if LXI-enabled per firmware).

XDM is Owon's cleanest LXI lineup — profile this family first.

### Power supply — SPE range

- **SPE3103 / SPE3051** (triple-output 3 × 30 V / 3 A + aux).
- **SPE6053 / SPE6103** (higher-power singles).
- **ODP series** (single-output programmable) — LXI only on selected SKUs; gate on firmware.

### Oscilloscope — selected XDS / HDS / SDS (Owon) ranges

- **XDS3000-series** (XDS3102A / XDS3104AE etc.) — entry 4 ch LXI scopes.
- **HDS / MSO ranges** — *not* in scope for this pack (most are USB-only; LAN variants are rare).
- **Other Owon scope lines** are deliberately deferred; cover XDS3000 and stop.

### Signal generator / electronic load / spectrum analyzer

Owon's LXI presence in these categories is thin and inconsistent. Declare
them **out of scope** for this pack; note in the step that a contributor
report with a specific LXI-enabled SKU will re-open the category.

## Acceptance criteria

- [x] New directory `packages/core/src/drivers/owon/` with per-family files (`xdm-profile.ts` / `xdm.ts`, `spe-profile.ts` / `spe.ts`, `xds-profile.ts` / `xds.ts`) following the sibling-pack convention. Shared helpers in `drivers/owon/_shared/` (`parsers.ts` for bool / unquote / overload sentinels, `opt.ts` for tolerant `*OPT?` handling).
- [x] **Manufacturer regex** `/owon|owon technologies|lilliput/i` (Owon's parent is Lilliput Electronic) plus a **model-only fallback** per family for firmwares that emit a blank manufacturer field (observed on some XDM drops). The blank-manufacturer path is covered by `owon-xdm1041` simulator personality and `packages/core/test/owon-profiles.test.ts`.
- [x] **Driver classes** per family. Profile variants:
  - `OwonXdm` — XDM1041 / XDM1241 / XDM2041 / XDM3041 / XDM3051.
  - `OwonSpe` — SPE3103 / SPE3051 / SPE6053 / SPE6103.
  - `OwonXds` — XDS3102A / XDS3104AE.
- [x] **Profile fields** identical shape to the sibling packs — the facade types do not change for Owon.
- [x] **Reduced capability surface**. The Owon drivers deliberately omit:
  - `logging`, `math`, `dualDisplay`, `temperature` on `OwonXdm` — the profile drops them and the facade shape hides the corresponding UI surface.
  - `decoders`, `references`, `history`, `display` on `OwonXds` — advanced acquisition surface is absent.
  - `pairing`, `tracking`, `protection`, `presets` on `OwonSpe` — per SCPI evidence; re-open via hardware reports.
- [x] **Refinement hook** per family (`refineXdmProfile`, `refineSpeProfile`, `refineXdsProfile`). Each is tolerant of `*OPT?` being unsupported or rejected — on failure the base profile is returned unchanged rather than propagating the error.
- [x] **Simulator personalities** under `packages/sim/personalities/owon/`:
  - `owon-xdm2041` (OWON manufacturer, 4-wire + presets).
  - `owon-xdm1041` (**blank manufacturer** — exercises the registry's model-only fallback).
  - `owon-spe3103` (triple-output, `INSTrument:NSELect` multiplexing, no pairing / tracking / protection mocked).
  - `owon-xds3104ae` (**Lilliput Electronics** manufacturer — exercises the parent-company regex; 4 ch, 8-bit waveform block, 10-field preamble).
- [x] **Custom SCPI port**. `DriverEntry` now carries an optional `defaultPort?: number`; every Owon entry sets `defaultPort: 3000`. The integration tests assert the hint is visible in `registry.resolve(...)?.defaultPort`. Pre-filling the Add-device form from this hint is a UI affordance left to a future step — the field is wired through today so the refinement is purely cosmetic.
- [x] **mDNS caveats** documented in `docs/steps/3-1-lan-discovery-mdns.md` (Notes section) and `docs/user/troubleshooting.md` ("Scan the LAN is empty" + "Connection refused" port-number recipe). No code change to discovery — the graceful empty-scan path already covers it.
- [x] **Tests**: `packages/core/test/owon-profiles.test.ts` covers per-variant registry resolution, catch-all defaults, manufacturer pattern tolerance (OWON / Owon / owon / Owon Technologies / Lilliput / blank), Keysight-isolation (34461A must not resolve as Owon), and the tolerant refinement hooks. `packages/sim/test/integration.test.ts` adds four end-to-end tests exercising DMM / PSU / scope facades against the new personalities.
- [x] **Supported-hardware matrix** entries are carried in Epic 4.9 as `Preview` with an explicit "LXI conformance: partial" note. This step adds the driver + registry surface that 4.9 documents.
- [x] **No regressions**. Full `pnpm --filter @lxi-web/core test` (146 tests) + `pnpm --filter @lxi-web/sim test` (35 tests) pass with the Owon additions.

## Notes

- **Set expectations honestly.** Owon is a budget-conscious vendor; their SCPI implementations prioritize the commands end-users hit most and drop the rest. The preview-driver + hardware-reports workflow from 4.9 is the only viable verification path — running a simulator through the stack is necessary but not sufficient.
- **Firmware drift.** Owon firmwares are updated less predictably than Rigol / Siglent / Keysight; behaviour differences between two "XDM2041" units in the wild are common. Encourage hardware reports to include firmware version in the IDN capture.
- **Prefer narrow profiles.** When an Owon SKU's capability list is ambiguous, default to the **conservative** option (capability *absent*). An absent capability silently hides the UI tab; a present-but-broken capability leaves the user staring at a button that errors.
- **Community bridges exist.** Some Owon scopes have community Python bridges that expose LAN access on SKUs that ship USB-only — those are not in scope for this pack. An explicit `LXI-required` note in `docs/user/supported-hardware.md` belongs in 4.9.
