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

- [x] New directory `packages/core/src/drivers/siglent/` with shared SCPI helpers in `drivers/siglent/_shared/` (parsers, `queryOptList`). Per-family modules flat at that level — `spd-profile.ts` / `spd.ts`, `sdm-profile.ts` / `sdm.ts`, `sds-profile.ts` / `sds.ts`, `sdl-profile.ts` / `sdl.ts`, `sdg-profile.ts` / `sdg.ts`, plus the SSA from 4.5.
- [x] **One driver class per family**: `SiglentSpd`, `SiglentSdm`, `SiglentSdsHd` (modern SCPI-2000 HD dialect — legacy X-E routes here as best-effort), `SiglentSdl`, `SiglentSdg`. Each implements its matching facade (`IPowerSupply`, `IMultimeter`, `IOscilloscope`, `IElectronicLoad`, `ISignalGenerator`) and reads capabilities from a variant profile. SDL and SDG ship as Preview — dynamic / battery / logging (SDL) and modulation / sweep / burst / arbitrary (SDG) advertise at the profile level but the driver intentionally omits the optional capability blocks until a hardware report confirms the shape.
- [x] **Registry** entries per variant + catch-all per family, following 4.2 pattern. Manufacturer pattern is the shared `siglent` substring — matches both `Siglent Technologies` and `SIGLENT TECHNOLOGIES CO., LTD.`. Variants are registered longest-name first so prefix regexes (`^SPD3303X\b`) don't shadow more specific SKUs (`SPD3303X-E`).
- [x] **Refinement hook** per family: `refineSpdProfile` probes `:SYSTem:CHANnel:COUNt?` to trim a 3-channel profile on a single-channel unit; `refineSdsProfile` narrows decoder protocols from `*OPT?` tokens (`SDS-I2C`, `SDS-SPI`, …); SDM / SDL / SDG / SSA refiners keep the base profile (no-ops pending hardware reports).
- [x] **Simulator personalities** for at least one variant per family:
  - `siglent-spd3303x-e` (PSU, 3-channel, tracking).
  - `siglent-sdm3065x` (DMM, full SCPI-1999 surface).
  - `siglent-sds824x-hd` (scope, SCPI-2000 HD dialect with synthetic 16-bit waveform).
  - `siglent-sdl1020x-e` (eload, round-trip `:SOURce`/`:MEASure` tree).
  - `siglent-sdg2042x` (SG, legacy `Cn:BSWV` dialect with two channels).
  - `siglent-ssa3032x` carries over from 4.5. Other variants resolve against these personalities' IDN patterns via the registry's regex-based variant table.
- [x] **Tests**: `packages/core/test/siglent-profiles.test.ts` iterates every SPD / SDM / SDS / SDL / SDG / SSA variant and asserts the registry selects the right entry with the right profile; includes a manufacturer-string tolerance check and refinement-hook coverage. `packages/sim/test/integration.test.ts` exercises SPD, SDM, SDS, SDL, SDG, and SSA end-to-end against their personalities — 190+ tests pass.
- [ ] **Supported-hardware entry** — lands in 4.9 (pack ships with `Preview` status on every Siglent SKU until community reports flip to `Verified`).
- [x] **No regressions** on Rigol drivers — every Rigol profile and integration test stays green.

## Notes

- **Trust the simulator, not the spec sheet.** Vendor programming guides for the SDS line are inconsistent across firmware drops. Where a command in the manual doesn't match the simulator's mocked behaviour, prefer the simulator contract and add a note — real-hardware reports will correct both over time.
- **Dialect anchoring.** When the SDS3000X HD SCPI dialect meaningfully diverges from SDS1000X-E (most common around `:TRIGger` and `:BUS`), create a `SiglentSds1000` vs `SiglentSds2000Plus` split **inside** `drivers/siglent/sds/` rather than one mega-class with profile branches. Profile branches are for *values*, not for *commands*.
- **LXI discovery.** The 3.1 service-type allowlist already covers Siglent (`_scpi-raw._tcp`, `_lxi._tcp`). Verify empirically during this step and record observed service strings + TXT fields in the step notes for 3.1's follow-ups.
- **IDN quirks.** Some Siglent firmwares emit `Siglent Technologies,SDS1104X-E,SDS1XEBCD...` while others emit `Siglent Technologies Co., Ltd.,SDS1104X-E,...`. The manufacturer matcher has to cope with both. Capture every observed variant in the test fixtures.
- **Save the hardware reports.** This pack will ship with zero hardware-verified entries — that's expected. 4.9's matrix + issue template is the surface where reports flow back and flip entries to `Verified`.
