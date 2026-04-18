# 4.10 — Vendor pack: Tektronix

## Goal

Add support for popular **Tektronix** LXI-enabled instruments. Tektronix is
one of the two "big name" bench vendors (alongside Keysight) and is
arguably the most common omission from the current matrix: TBS/MDO/MSO/DPO
scopes are ubiquitous in US and EDU labs, AFG/AWG function generators are
common, and the MDO line carries a built-in spectrum analyzer that crosses
into the 4.5 façade.

Land the families with profile-driven drivers under `drivers/tektronix/`,
following the pattern established in 4.2 / 4.6 / 4.7. Everything ships as
**Preview** in the 4.9 supported-hardware matrix until community hardware
reports convert entries to **Community** or **Verified**.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md), [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md), [4-8-vendor-pack-owon.md](4-8-vendor-pack-owon.md) — sister vendor packs.
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — supported-hardware surface.

## Target instruments

### Oscilloscope — TBS / MDO / MSO / DPO ranges (primary target)

- **TBS1000C / TBS2000B** — entry two-channel / four-channel benchscopes (USB-centric; include LXI-capable models only).
- **MDO3000 / MDO4000C** — mixed-domain scopes with built-in SA; SA façade from 4.5 should bind cleanly.
- **MSO / DPO 2000B / 3000 / 4000B / 5 Series MSO** — the bulk of the lineup; wide dialect coverage required.
- **MSO 6 Series B** — higher-tier flagship; same SCPI tree as the 5 Series with extra bandwidth options.

SCPI notes:

- Older firmware uses `CURVE?` rather than `WAVeform:DATA?`; IEEE block
  format matches 488.2. The driver needs to support both.
- `WFMPre?` and `WFMOutpre?` return the preamble (Y-mult, X-incr, origin,
  offset, encoding) — driver should decode whichever the target firmware
  serves.
- Trigger tree is `TRIGger:A:TYPE` + `TRIGger:A:EDGE:SOURce` etc., similar
  enough to the DHO800 pattern to reuse the discriminated-union shape from
  2.7a.
- Measurements on newer Tek firmware use `MEASUrement:MEAS<N>:TYPE`;
  older uses `MEASUrement:IMMed:TYPE`.
- Decoder support: I²C / SPI / UART / CAN / LIN on 4 Series and up, SENT /
  FlexRay only on higher-tier options.

### Signal generator — AFG range

- **AFG1000 / AFG3000C / AFG31000** — single / dual channel function and
  arbitrary generators. `AFG31000` supports larger memory and higher
  bandwidth variants; family profile should gate arbitrary memory size.

SCPI surface matches `SOURce<n>:FUNCtion`, `SOURce<n>:FREQuency`,
`SOURce<n>:VOLTage:AMPLitude` — reuse the `ISignalGenerator` façade from
4.4 with a dedicated `Afg3000Profile`.

### AWG — AWG5200 / 70000 (deferred)

High-end AWGs (AWG70001B, AWG5200 series) have a very different SCPI
surface and waveform sequencer. Reserve the IDN patterns; explicit driver
work deferred to backlog.

### Power supply — PWS range

- **PWS2000 / PWS4000 series** — entry programmable bench PSUs. LXI
  support varies by firmware; include only LXI-confirmed SKUs.
- Tektronix's PSU line is thin compared to Keysight E36xxx; treat as
  low-priority within this pack.

### Spectrum analyzer — RSA / MDO built-in

- **RSA300 / RSA500 / RSA600 series** — real-time SAs via the
  SignalVu/TekVisa bridge; TCP SCPI support exists on some models.
- **MDO built-in SA** — reuse the 4.5 `ISpectrumAnalyzer` façade; detect
  via `*OPT?` presence of the RF channel.

## Driver plan

- New `drivers/tektronix/` package with `_shared/` helpers (manufacturer
  regex, `*OPT?` parsing, preamble decoders).
- Manufacturer regex: `/tektronix/i` (Tek IDN tends to use `TEKTRONIX` or
  `Tektronix`; a single case-insensitive match is enough).
- One driver class per family following the 4.2 pattern:
  `TektronixTbs` (TBS1000C / TBS2000B), `TektronixMso` (MSO/DPO 2000B /
  3000 / 4000B / 5 Series / 6 Series / MDO), `TektronixAfg` (AFG1000 /
  3000C / 31000), `TektronixPws` (PWS2000 / 4000).
- Per-family profile types carrying channel count, bandwidth tier, memory
  depth, decoder list, arbitrary-waveform ceiling, MSO digital-channel
  count.
- Registry: per-variant entries + conservative catch-all per family,
  sorted longest-name-first so specific SKUs win over broader prefixes.
- `refine*Profile` hooks for each family: narrow decoders / bandwidth /
  digital channels from `*OPT?` tokens where the option string is
  well-specified (MSO 5/6 Series); return base profile on failure.

## Simulator plan

- `tektronix-tbs2000b`, `tektronix-dpo4054b`, `tektronix-mso54`,
  `tektronix-afg31102`, `tektronix-pws4323` personalities covering
  representative variants.
- Reuse `makeDg9xxPersonality` and `Ssa3000xProfile` scaffolding patterns
  from 4.4 / 4.5 for the AFG and MDO SA personalities.
- Preamble-driven waveform decoder exercised in sim integration test (both
  `CURVE?` and `WFMOutpre?` paths).

## Acceptance criteria

- [ ] Profile-driven drivers under `drivers/tektronix/` cover the variant
      tables listed above for TBS / MSO / MDO / AFG / PWS families.
- [ ] Manufacturer regex resolves `TEKTRONIX` and `Tektronix` IDN strings
      to the right family; model regex tolerates `TBS2102B`, `DPO4054B`,
      `MSO56`, `MDO3104`, `AFG31102` spellings.
- [ ] Simulator personalities for the representative variants round-trip
      core commands (IDN / OPT / waveform / frequency / amplitude / output
      enable / measurements) against the new drivers.
- [ ] `refine*Profile` hooks narrow capabilities from `*OPT?` tokens
      (decoders, MSO digital channels, RF option for MDO).
- [ ] `CURVE?` ↔ `WFMOutpre?` dual-path waveform decode is unit tested.
- [ ] All Tektronix rows land in `docs/user/supported-hardware.md` with
      **Preview** status; pack integrated into the flagship matrix.
- [ ] New `packages/core/test/tektronix-profiles.test.ts` iterates every
      variant and exercises each refiner + manufacturer regex.
- [ ] Extensions in `packages/sim/test/integration.test.ts` cover each new
      personality end-to-end against the matching driver.

## Notes

- Tektronix's SCPI is IEEE 488.2-clean *within* a generation but jumps
  between generations (2000-series → 4000B → 5/6 Series MSO each changed
  sub-trees). Keep per-family profile isolation strict.
- MDO's RF channel re-uses the 4.5 `ISpectrumAnalyzer` façade via
  capability composition — the driver exposes both `IOscilloscope` and a
  separately-resolved `ISpectrumAnalyzer` under the same TCP session.
- Tektronix's trigger extensions (setup-hold, timeout, window, runt,
  pattern) map onto the existing discriminated-union shapes from 2.7a
  with minimal new work.
- RSA real-time SA and AWG7000-series AWG are explicitly deferred — they
  deserve their own step once the base pack lands and a community report
  asks for them.
