# 4.7 — Vendor pack: Keysight (and legacy Agilent)

## Goal

Add first-class support for the **Keysight** test and measurement range
(which includes the legacy **Agilent Technologies** inventory — the test &
measurement division was rebranded Keysight in 2014, so pre-2014 gear
still identifies as Agilent). Cover the v1 device kinds plus new-kind
Keysight variants that land after 4.3 / 4.4 / 4.5. All drivers are
**profile-driven** per 4.2 and verified against 4.1 simulator personalities.
Keysight instruments are typically expensive lab gear; community hardware
reports per 4.9 are the dominant verification path.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern.
  - [4-3-electronic-load.md](4-3-electronic-load.md), [4-4-signal-generator.md](4-4-signal-generator.md), [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md) — facades this pack extends.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md) — sister step, same shape.
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — supported-hardware surface.

## Target instruments

### Oscilloscope — InfiniiVision range

- **InfiniiVision 1000X-series** (DSOX1102A/G, DSOX1204A/G) — entry-level, 4 ch.
- **InfiniiVision 2000X-series** (DSOX2002A/2004A/2012A/2014A/2022A/2024A) — 2/4 ch, 70–200 MHz.
- **InfiniiVision 3000T-series** (DSOX3024T/3034T/3054T/3104T) — 4 ch, 200 MHz–1 GHz, capacitive touch.
- **InfiniiVision 4000X-series** (DSOX4024A/4034A/4054A/4104A) — 4 ch, 200 MHz–1.5 GHz.
- **InfiniiVision 6000X-series** (DSOX6002A/6004A/6012A/6014A) — 4 ch, 1 GHz–6 GHz.
- **MSOX variants** of each (MSO = additional logic channels) share the same SCPI dialect; advertise a `digitalChannels` capability when the profile says so. Actual MSO UI support is backlog — this pack declares the capability shape, it doesn't render logic lanes.

Profile fields: `channels`, `bandwidthMhz`, `maxSampleRate`, `memoryDepth`,
`bwLimits`, `decoderProtocols`, `referenceSlots`, `mso` (digital-channel
count or `none`).

### Power supply — E36xxx + EDU36xxx range

- **EDU36311A** (3 ch / 6 V / 5 A + 25 V / 1 A + -25 V / 1 A) — education-tier, LXI.
- **E36100-series** (single-output, E36102A / E36103A / E36104A / E36105A / E36106A) — low-cost, LXI.
- **E36300-series** (triple-output, E36311A / E36312A / E36313A) — programmable triple outputs.
- Legacy Agilent **E364xA** (E3640A / E3641A / E3642A etc.) — LXI-capable, same SCPI family.

Profile: per-channel voltage / current max, protection ranges, pairing
(typically series / parallel on E36300 pairs), tracking, preset slots.

### Multimeter — Truevolt 34400A range

- **34450A** (5½-digit, low-cost LXI entry).
- **34461A** (6½-digit Truevolt).
- **34465A** (6½-digit Truevolt, higher resolution).
- **34470A** (7½-digit Truevolt).
- Legacy Agilent **34401A / 34410A / 34411A** — LXI for the `34410A` / `34411A`; 34401A is GPIB-only so it falls out of scope.

Profile: supported modes, range tables per mode, NPLC options, digitize
capability (34465A / 34470A), dBm references, temperature transducers
(RTD / thermocouples on Truevolt), statistics and histogram capability.

### Electronic load — EL3xxxx range (if 4.3 landed)

- **EL34143A** (single-channel, 150 V / 40 A / 350 W).
- **EL34243A** (dual-channel, 150 V / 40 A / 300 W).

### Signal generator — 33500B / 33600A range (if 4.4 landed)

- **33509B / 33510B / 33511B / 33512B** (Trueform 33500B, 1 / 2 ch, 20 MHz).
- **33521B / 33522B** (Trueform 33500B, 30 MHz).
- **33611A / 33612A / 33621A / 33622A** (Trueform 33600A, 80–120 MHz).

### Spectrum analyzer — N9xxx range

Out of scope for this pack as a driver target — Keysight SA dialect
(SCPI under the PXA / UXA / BSA / CXA families) is non-trivial and the
first driver anchor for SA is Siglent in 4.5. Keysight SA support is
backlog; document the reservation in this step so the registry doesn't
accidentally scoop them into another kind.

## Acceptance criteria

- [x] New directory `packages/core/src/drivers/keysight/` with per-family files (`infiniivision.ts` + `infiniivision-profile.ts`, `e36.ts` + `e36-profile.ts`, `truevolt.ts` + `truevolt-profile.ts`, `el3.ts` + `el3-profile.ts`, `3350x.ts` + `3350x-profile.ts`) plus shared helpers in `drivers/keysight/_shared/` (`parsers.ts`, `opt.ts`). Flat per-family layout chosen over subdirectories to match the `drivers/siglent/` precedent.
- [x] **Manufacturer regex** `/keysight|agilent technologies/i` in `drivers/keysight/index.ts` catches both `Keysight Technologies` and `Agilent Technologies` case-insensitively; a dedicated `infiniiVisionModelRegex` helper additionally tolerates `DSOX2024A`, `DSO-X 2024A`, and `DSO-X2024A` spellings so a DSOX2024A resolves regardless of firmware era. Regression-covered in `keysight-profiles.test.ts`.
- [x] **One driver class per family** (`KeysightE36`, `KeysightTrueVolt`, `KeysightInfiniiVision`, `KeysightEl3`, `KeysightTrueform33500`) each backed by its variant-profile table covering every SKU listed above. Catch-all registry entries per family (`/^(?:EDU)?E?36\d{3}[A-Z]/i`, `/^E364\d[A-Z]/i`, `/^344\d{2}A/i`, `/^(?:DSO|MSO)-?X\s?\d{4}[ATG]/i`, `/^EL3\d{4}A/i`, `/^335\d{2}B/i`, `/^336\d{2}A/i`), sorted longest-variant-first so `EDU36311A` wins over `E36311A`.
- [x] **Refinement hook** per family using `*OPT?`:
  - InfiniiVision: `refineInfiniiVisionProfile` narrows `decoderProtocols` against `*OPT?` tokens (CAN, I²C, SPI, UART/RS232, LIN, FlexRay, I²S) and inspects bandwidth-upgrade + MSO tokens; mutates only decoder protocols (bandwidth / MSO mutations kept observational for 4.7, queued for a later epic so we don't silently widen capability shape).
  - E36300: `refineE36Profile` observes OVP/OCP + tracking-firmware tokens and preserves the base profile (observational in 4.7; firmware-version gating queued).
  - Truevolt: `refineTrueVoltProfile` observes `DIG`, `TEMP`, `HIST` tokens and preserves the base profile (observational in 4.7 per the "do not widen DMM capability shape" note).
  - 33500B / 33600A: `refineTrueform33500Profile` reserves the hook shape for arbitrary-memory / sequence / IQ license probing (observational in 4.7).
  - EL3: `refineEl3Profile` reserves the hook shape for future load licenses.
- [x] **Simulator personalities** under `packages/sim/personalities/keysight/` covering every target:
  - Scope: `infiniivision-dsox2024a` (advertises the `DSO-X 2024A` firmware spelling on purpose), `infiniivision-dsox3034t` (advertises `DSO-X 3034T`). Shared stateful handlers in `_shared/infiniivision.ts` (channels, timebase, trigger, acquisition, `:WAVeform:FORMat WORD` preamble + synthetic waveform, PNG screenshot stub).
  - PSU: `edu36311a`, `e36313a`. Shared `_shared/e36.ts` handles `INSTrument:NSELect`, per-channel V/I/output, OVP/OCP, `OUTPut:PAIR`, `OUTPut:TRACk`, `*SAV`/`*RCL`.
  - DMM: `truevolt-34461a`, `truevolt-34470a`. Shared `_shared/truevolt.ts` handles function + range + NPLC + auto-zero + dual display + temperature transducer + synthetic readings.
  - E-load: `el34243a` (CC/CV/CR/CP + OVP/OCP/OPP + synthetic I/V/P/R).
  - AWG: upgraded `33511b` from placeholder stub to round-trip-functional (waveform/frequency/amplitude/offset/phase, waveform-specific modifiers, output, load impedance).
  - `n9320b` remains a reserved IDN stub per the 4.7 N9xxx-SA-is-backlog decision.
- [x] **Tests** mirror the Siglent pack:
  - `packages/core/test/keysight-profiles.test.ts` iterates every E36 / Truevolt / InfiniiVision / EL3 / 33500B variant, asserts each maps to its per-SKU registry entry with the right kind and profile fields, validates catch-all entries (`E36999Z` → `E36xxx`, `34499A` → `34xxxA`), exercises `Keysight` / `Agilent Technologies` / shouty-case manufacturer tolerance, InfiniiVision `DSO-X 2024A` + `MSO-X 3034T` spelling tolerance, and the decoder-narrowing behaviour of `refineInfiniiVisionProfile`.
  - `packages/sim/test/integration.test.ts` gained six Keysight end-to-end cases: 33511B waveform round-trip, EDU36311A PSU channel state, Truevolt 34461A mode + value, InfiniiVision DSOX2024A waveform decode, InfiniiVision DSOX3034T dashed-IDN resolution, and EL34243A setpoint round-trip.
- [x] **Supported-hardware matrix** entries (4.9) — every Keysight variant will land in `docs/user/supported-hardware.md` with `Preview` status when 4.9 ships; `progress.md` already lists the full family coverage so the matrix page can enumerate them.
- [x] **No regressions** on Rigol or Siglent drivers — `pnpm -r typecheck` + `pnpm -r test` green (31 sim tests + all core suites pass after the vendor pack landed).

## Notes

- **Agilent vs Keysight IDN.** Some legacy gear still advertises "Agilent Technologies" even after firmware updates. The registry match accepts either; the `shortIdentity` rendering in the overview card should display what the instrument actually reports (no silent rewriting).
- **InfiniiVision SCPI is big.** Don't try to reach for every subsystem. Mirror the DHO800 driver scope — channels / timebase / trigger / acquisition / measurements / cursors / math / refs / history / display / presets / decoders — and stop.
- **Truevolt digitize mode** is tempting because it's a clear win for a DMM UI, but it's a follow-up. 2.6c's buffered trend logger is the closest existing capability; do not widen the `MultimeterLoggingCapability` shape as part of this pack.
- **LXI IDD.** Keysight instruments reliably serve a rich LXI identification XML; parsing that as a nice-to-have overview-card enrichment is a backlog item, not a blocker for this pack.
- **Safety interlocks.** Keysight lab PSUs (E36300) occasionally need an explicit `OUTP:ENABle:TRAN` unlock after protection trips. Document per-variant quirks in the step notes; don't hide them behind retry logic.
- Keysight pre-2014 Agilent-branded gear (E36xxA first-generation, 34410A) often uses GPIB or serial with a LAN gateway — only **LXI-native** variants are in scope. GPIB bridges are Epic-6-deferred territory.
