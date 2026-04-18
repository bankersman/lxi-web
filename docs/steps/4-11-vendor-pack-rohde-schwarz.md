# 4.11 — Vendor pack: Rohde & Schwarz

## Goal

Add support for popular **Rohde & Schwarz** (R&S) LXI-enabled instruments.
R&S is the European counterpart to Keysight — their SCPI is arguably the
cleanest IVI-conformant dialect on the market, which makes this pack
largely a profile-table exercise once one family lands. Also bring along
legacy **HAMEG** IDN strings, since R&S rolled Hameg into their bench
lineup and some firmware still identifies as `HAMEG`.

Land the families with profile-driven drivers under `drivers/rnds/`
(avoiding the `&` character in the directory name; the manufacturer regex
handles the ampersand). Everything ships as **Preview** in the 4.9
supported-hardware matrix until community reports convert entries to
**Community** or **Verified**.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md), [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md), [4-10-vendor-pack-tektronix.md](4-10-vendor-pack-tektronix.md) — sister vendor packs.
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — supported-hardware surface.

## Target instruments

### Oscilloscope — RTB / RTM / RTA / MXO

- **RTB2000** — entry 4-ch 70 / 100 / 200 / 300 MHz.
- **RTM3000** — mid-range 4-ch 200 MHz - 1 GHz.
- **RTA4000** — higher sample memory and deep-memory segmented capture.
- **MXO4 / MXO5** — current-gen flagship 4 / 8 channel scopes.
- **HMO1002 / HMO1202 / HMO2024** — legacy Hameg-branded; IDN still says `HAMEG`.

SCPI notes:

- Shared R&S "RTH/RT" tree: `CHANnel<n>:*`, `TIMebase:*`, `TRIGger:A:*`,
  `ACQuire:*` — almost 1:1 with the IVI-4.1 reference.
- Waveform download via `CHANnel<n>:DATA?` returning IEEE binary with a
  matching `CHANnel<n>:DATA:HEADer?` preamble. Much simpler than either
  DHO800 or InfiniiVision's preamble layout.
- Measurement tree: `MEASurement<n>:MAIN` + `MEASurement<n>:CATegory` —
  large catalogue shared across models; variant table lists per-model
  caps.

### Power supply — NGE / NGL / NGM / NGP / NGU

- **NGE100 / NGE103B** — triple-output 32 V / 3 A bench PSUs.
- **NGL200 / NGL201 / NGL202** — 2-quadrant "linear" lab PSUs with mA
  digitising.
- **NGM200 / NGM201 / NGM202** — battery-profile lab PSUs with fast
  transient capture.
- **NGP800 / NGP804 / NGP814** — high-power multi-output modular PSUs.
- **NGU201 / NGU401** — source-measure-oriented two-quadrant units
  (borders on SMU; flag the SMU tag but don't force SMU façade yet).

SCPI notes:

- All the above use `INSTrument:NSELect` + `SOURce:VOLTage` / `:CURRent`,
  with OVP/OCP via `SENSe:VOLTage:PROTection` and protection levels under
  `SOURce:VOLTage:PROTection`.
- Preset memory via `*SAV`/`*RCL` (10 slots) + named preset via
  `MEMory:RCL` with string argument on NGL/NGM/NGP.

### Multimeter — HMC / HMP / R&S

- **HMC8012** — 5¾-digit bench DMM with arbitrary math + dual display.
- **HMC8015** — power analyzer / DMM hybrid; treat the DMM half for this
  pack and log the power-analyzer features as backlog.

SCPI notes: follows IVI-4.8 almost to the letter — `CONFigure:*`,
`SENSe:FUNCtion`, `SENSe:<func>:RANGe`, `SENSe:<func>:NPLC`,
`CALCulate:FUNCtion NULL|DB|DBM|AVERage|LIMit`. Reuse the DM800 / Truevolt
driver shape with a new profile.

### Signal generator — SMA / SMB / SMBV / HMF / HMC804x

- **SMA100A / SMA100B** — analog signal generators up to 67 GHz
  (profile-gate on frequency tier).
- **SMB100A / SMBV100A / SMBV100B** — vector signal generators.
- **HMF2550 / HMF2525** — mid-tier 25 / 50 MHz AWGs (Hameg heritage).
- **HMC8041 / HMC8042 / HMC8043** — low-end lab AWG / function gens.

SCPI surface matches `SOURce<n>:FUNCtion`, `SOURce<n>:FREQuency`,
`SOURce<n>:AM|FM|PM|SWEep|BURSt:*`. Reuse the 4.4 `ISignalGenerator`
façade with a dedicated `SmbSmaProfile` / `Hmf2500Profile`.

### Spectrum analyzer — FPC / FPL / HMS / ESR / FSW

- **FPC1000 / FPC1500** — entry 1 GHz / 3 GHz SAs.
- **FPL1000 / FPL1003 / FPL1014** — mid-tier handheld/benchtop SAs.
- **HMS1000** — Hameg-heritage SA.
- **FSW / FSVA / ESR** — flagship R&S SA lines (large SCPI surface; start
  conservative and extend as community reports arrive).

Reuse the 4.5 `ISpectrumAnalyzer` façade with a dedicated R&S profile.

## Driver plan

- New `drivers/rnds/` package with `_shared/` helpers.
- Manufacturer regex: `/rohde\s*&\s*schwarz|r&s|hameg/i` — matches
  `Rohde&Schwarz`, `ROHDE&SCHWARZ`, `Rohde & Schwarz`, `R&S`, legacy
  `HAMEG`.
- One driver class per family following the 4.2 pattern:
  `RndsRtb` (RTB / RTM / RTA / MXO), `RndsNge` (NGE / NGL / NGM / NGP /
  NGU), `RndsHmc` (HMC8012 / HMC8015), `RndsSma` (SMA / SMB / SMBV), 
  `RndsHmf` (HMF / HMC804x), `RndsFpc` (FPC / FPL / HMS).
- Per-family profile types carrying channel count, bandwidth tier,
  measurement catalogue, decoder list, and Hameg-alias flags.
- Registry: per-variant + catch-all regex per family, longest-name-first
  ordering so `MXO5` wins over `MXO`.
- `refine*Profile` hooks narrow bandwidth tier and options from `*OPT?`;
  default path is NOP since R&S firmware publishes capabilities cleanly.

## Simulator plan

- `rnds-rtb2004`, `rnds-mxo44`, `rnds-nge103b`, `rnds-ngl202`,
  `rnds-hmc8012`, `rnds-smbv100a`, `rnds-hmf2525`, `rnds-fpc1500`
  personalities covering representative variants.
- Hameg-legacy IDN `HAMEG,HMO1202,123456,05.614` exercised in at least
  one simulator fixture to verify the manufacturer regex picks up the
  legacy brand.

## Acceptance criteria

- [ ] Profile-driven drivers under `drivers/rnds/` cover the variant
      tables listed above for RTB/MXO, NGE/NGL/NGM/NGP, HMC, SMA/SMB,
      HMF, and FPC/FPL/HMS families.
- [ ] Manufacturer regex resolves all of `Rohde&Schwarz`,
      `Rohde & Schwarz`, `R&S`, and `HAMEG` IDN strings.
- [ ] Simulator personalities for the representative variants round-trip
      core commands against the new drivers.
- [ ] `refine*Profile` hooks narrow capabilities from `*OPT?` tokens
      (decoders, bandwidth tier, frequency tier for signal generators).
- [ ] All R&S rows land in `docs/user/supported-hardware.md` with
      **Preview** status; pack integrated into the flagship matrix.
- [ ] New `packages/core/test/rnds-profiles.test.ts` iterates every
      variant and exercises each refiner + manufacturer-regex tolerance
      (with an explicit `HAMEG` case).
- [ ] Extensions in `packages/sim/test/integration.test.ts` cover each
      new personality end-to-end against the matching driver.

## Notes

- R&S SCPI is the cleanest of all four Epic 4 vendor packs — much of this
  step is mechanical profile tables. Leverage that to keep per-model
  testing wide.
- FSW / FSVA / ESR flagship SAs have enormous SCPI surfaces; keep this
  step's SA coverage focused on FPC / FPL / HMS and reserve FSW as a
  backlog item once a real FSW-series hardware report lands.
- NGU SMU-adjacent PSUs should expose their source-measure surface via
  the `IPowerSupply` façade for now; a full SMU façade is backlog.
- HMC8015 power-analyzer features are backlog — this pack covers the DMM
  half only.
