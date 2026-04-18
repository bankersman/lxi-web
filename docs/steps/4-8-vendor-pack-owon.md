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

- [ ] New directory `packages/core/src/drivers/owon/` with subfolders `xdm/`, `spe/`, `xds/`. Shared helpers in `drivers/owon/_shared/`.
- [ ] **Manufacturer regex** matches `owon|owon technologies|lilliput` (Owon's parent) case-insensitively. Some Owon firmwares emit just model code with a blank manufacturer field — capture those quirks in the step notes and handle via model-only fallback.
- [ ] **Driver classes** per family. Profile variants:
  - `OwonXdm` — XDM1041 / XDM1241 / XDM2041 / (XDM3041 if LXI).
  - `OwonSpe` — SPE3103 / SPE3051 / SPE6053 / SPE6103.
  - `OwonXds` — XDS3102A / XDS3104AE (and any verified sibling).
- [ ] **Profile fields** identical shape to the sibling packs — the facade types do not change for Owon.
- [ ] **Reduced capability surface**. Owon instruments typically do **not** support:
  - Full math / measurement catalogs equivalent to Rigol DHO800 — advertise a narrower `MEASUREMENT_ITEMS` list per profile.
  - Buffered logging or statistics on XDM — `logging` and `math` capabilities on `IMultimeter` are **absent** on Owon profiles; the UI correctly hides those tabs.
  - Advanced scope decoders — `decoders` capability **absent** on XDS profile.
  - Pairing / tracking on SPE — advertise only where confirmed by community reports.
- [ ] **Refinement hook** per family: XDM supports `*OPT?` on some firmwares; SPE rarely. Where `*OPT?` is unsupported, the refiner returns the base profile unchanged rather than throwing.
- [ ] **Simulator personalities**:
  - `owon-xdm2041`, `owon-xdm1041` (DMM).
  - `owon-spe3103` (PSU).
  - `owon-xds3104ae` (scope).
  Each personality documents its known IDN variant(s); at least one personality per family exercises the "empty-manufacturer" SCPI quirk so the registry fallback path is covered.
- [ ] **Custom SCPI port**. Some Owon gear listens on **3000** instead of the usual 5025. Add a per-driver-entry `defaultPort` hint on the registry and have the UI pre-fill that port when an Owon candidate is picked from discovery. The server never overrides an explicit user-supplied port.
- [ ] **mDNS caveats**. Owon instruments frequently fail to advertise `_lxi._tcp`. Update `docs/steps/3-1-lan-discovery-mdns.md` notes and the user-facing `docs/user/troubleshooting.md` with the "manual host / port" fallback recipe for Owon. No code change to discovery itself — the feature is already graceful.
- [ ] **Tests** per variant profile resolution + simulator-driven integration.
- [ ] **Supported-hardware matrix** entries all start `Preview` until community hardware reports verify them. Flagged with a "LXI conformance: partial" note so operators know to expect rough edges.
- [ ] **No regressions** on other vendor packs.

## Notes

- **Set expectations honestly.** Owon is a budget-conscious vendor; their SCPI implementations prioritize the commands end-users hit most and drop the rest. The preview-driver + hardware-reports workflow from 4.9 is the only viable verification path — running a simulator through the stack is necessary but not sufficient.
- **Firmware drift.** Owon firmwares are updated less predictably than Rigol / Siglent / Keysight; behaviour differences between two "XDM2041" units in the wild are common. Encourage hardware reports to include firmware version in the IDN capture.
- **Prefer narrow profiles.** When an Owon SKU's capability list is ambiguous, default to the **conservative** option (capability *absent*). An absent capability silently hides the UI tab; a present-but-broken capability leaves the user staring at a button that errors.
- **Community bridges exist.** Some Owon scopes have community Python bridges that expose LAN access on SKUs that ship USB-only — those are not in scope for this pack. An explicit `LXI-required` note in `docs/user/supported-hardware.md` belongs in 4.9.
