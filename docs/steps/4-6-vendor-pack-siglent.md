# 4.6 — Vendor pack: Siglent

## Goal

Add first-class support for the **Siglent** range across the v1 device kinds
(oscilloscope, power supply, multimeter) and fill in the Siglent entries for
the new-kind facades shipped in 4.3 / 4.4 / 4.5 (electronic load, signal
generator, spectrum analyzer). All drivers are **profile-driven** per 4.2,
verified against 4.1 simulator personalities (Siglent has no presence in my
test lab — hardware verification lands through community reports per 4.9).

Siglent is the first non-Rigol vendor pack because their LXI + SCPI
conformance is consistently clean and their instruments are widely deployed
in small labs and maker benches, so community reports arrive fast.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern (Siglent ranges have per-variant tiers just like Rigol).
  - [4-3-electronic-load.md](4-3-electronic-load.md), [4-4-signal-generator.md](4-4-signal-generator.md), [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md) — the facades this pack extends.
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — where Siglent entries land in the user-facing table.

## Target instruments

All targets must have LXI TCP (port 5025) and an IDN string starting with
`Siglent Technologies,` (some older firmwares use `SIGLENT` — the regex
must be case-insensitive).

### Oscilloscope — SDS range

- **SDS1000X-E** (7" 200 MHz / 100 MHz, 2 ch) — entry-level, widely owned.
- **SDS800X-HD** (7" 70–200 MHz, 12-bit, 4 ch) — current-gen entry.
- **SDS2000X-HD / SDS2000X Plus** (10" 100–500 MHz, 4 ch).
- **SDS3000X HD / SDS3000X Plus** (12" 200 MHz–1 GHz, 4 ch).
- **SDS6000A / SDS6000L** (15" 1 GHz–2 GHz, 4 ch).

Profile fields: `channels`, `bandwidthMhz`, `maxSampleRate`, `memoryDepths`,
`bitDepth`, `bwLimits`, `decoderBuses`, `decoderProtocols`, `referenceSlots`.
SDS1000X-E is the **SCPI dialect anchor** — other families are close but
not identical (SDS2000X Plus adds different trigger namespaces); profile the
dialect differences if the deltas are material, otherwise sub-class.

### Power supply — SPD range

- **SPD1168X** (1 ch / 16 V / 8 A).
- **SPD1305X** (1 ch / 30 V / 5 A).
- **SPD3303X-E / SPD3303X / SPD3303C** (3 ch / 30 V / 3 A + aux 2.5 / 3.3 / 5 V).
- **SPD4000 series** if LXI-enabled at ship time — verify per firmware.

Profile fields mirror DP900: per-channel voltage/current max, OVP/OCP ranges,
pairing capability (SPD3303 supports series / parallel on CH1+CH2),
tracking, preset slots.

### Multimeter — SDM range

- **SDM3045X** (4½-digit entry).
- **SDM3055** (5½-digit).
- **SDM3065X / SDM3065X-SC** (6½-digit with scanner card).

Profile fields mirror DM800: supported modes, per-mode range table,
NPLC options, dBm references, transducer list, dual-display pairs.

### Electronic load — SDL range (if 4.3 landed)

- **SDL1020X-E** (150 V / 30 A / 200 W).
- **SDL1030X-E** (150 V / 30 A / 300 W).
- **SDL1020X** (150 V / 30 A / 200 W, with dynamic + list).

### Signal generator — SDG range (if 4.4 landed)

- **SDG1032X / SDG1062X** (2 ch / 30 / 60 MHz).
- **SDG2000X / SDG2082X / SDG2122X** (2 ch / 80 / 120 MHz).
- **SDG6022X / SDG6052X** (2 ch / 200 MHz / 500 MHz).

### Spectrum analyzer — SSA range (driver anchor from 4.5)

The SSA3000X Plus driver shipped in 4.5 already sits in `drivers/siglent/`;
this step just confirms variants + simulator personalities + supported-
hardware entries. SSA5000A is backlog.

## Acceptance criteria

- [ ] New directory `packages/core/src/drivers/siglent/` with subfolders matching family (`sds/`, `spd/`, `sdm/`, optional `sdl/`, `sdg/`, `ssa/`). Shared SCPI helpers in `drivers/siglent/_shared/` mirror the Rigol layout.
- [ ] **One driver class per family** (e.g. `SiglentSds` for all SDS scopes) with a profile table per variant listed above. Each driver implements the matching facade (`IOscilloscope`, etc.) and the profile advertises which optional capabilities are present.
- [ ] **Registry** entries per variant + catch-all per family, following 4.2 pattern. Manufacturer pattern is `siglent|siglent technologies`.
- [ ] **Refinement hook** per family: Siglent surfaces installed options and firmware-gated features through `*OPT?` and `:SYSTem:OPTion?`. Implement at least for SDS (bandwidth / decode / MSO options) and SPD (tracking / pairing availability by firmware).
- [ ] **Simulator personalities** for at least **one variant per family** under `packages/sim/personalities/siglent/`:
  - `sds1000x-e`, `sds2000x-plus` (scope).
  - `spd3303x-e`, `spd1305x` (PSU).
  - `sdm3065x`, `sdm3055` (DMM).
  - `sdl1020x-e` if 4.3 shipped; `sdg2042x` if 4.4 shipped; `ssa3032x` if 4.5 shipped (already from that step — cross-reference only).
  Other variants can ship as IDN-only stubs that reuse a sibling personality's handlers.
- [ ] **Tests**: profile-resolution tests iterate every listed variant and assert the registry selects the right `DriverEntry`. Integration tests run each personality through the matching typed routes + WS topics against the simulator — this is the primary verification path because there is no hardware.
- [ ] **Supported-hardware entry** in the table delivered by 4.9 with `Preview` status for every Siglent variant until a community hardware report lands; hardware reports flip entries to `Verified`.
- [ ] **No regressions** on Rigol drivers or any shared facade logic — the Rigol family drivers from 4.2 stay byte-identical in behaviour.

## Notes

- **Trust the simulator, not the spec sheet.** Vendor programming guides for the SDS line are inconsistent across firmware drops. Where a command in the manual doesn't match the simulator's mocked behaviour, prefer the simulator contract and add a note — real-hardware reports will correct both over time.
- **Dialect anchoring.** When the SDS3000X HD SCPI dialect meaningfully diverges from SDS1000X-E (most common around `:TRIGger` and `:BUS`), create a `SiglentSds1000` vs `SiglentSds2000Plus` split **inside** `drivers/siglent/sds/` rather than one mega-class with profile branches. Profile branches are for *values*, not for *commands*.
- **LXI discovery.** The 3.1 service-type allowlist already covers Siglent (`_scpi-raw._tcp`, `_lxi._tcp`). Verify empirically during this step and record observed service strings + TXT fields in the step notes for 3.1's follow-ups.
- **IDN quirks.** Some Siglent firmwares emit `Siglent Technologies,SDS1104X-E,SDS1XEBCD...` while others emit `Siglent Technologies Co., Ltd.,SDS1104X-E,...`. The manufacturer matcher has to cope with both. Capture every observed variant in the test fixtures.
- **Save the hardware reports.** This pack will ship with zero hardware-verified entries — that's expected. 4.9's matrix + issue template is the surface where reports flow back and flip entries to `Verified`.
