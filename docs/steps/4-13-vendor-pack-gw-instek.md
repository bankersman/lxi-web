# 4.13 — Vendor pack: GW Instek

## Goal

Add support for popular **GW Instek** LXI-enabled instruments. GW Instek
is a Taiwanese bench vendor heavily represented in educational and
budget lab settings, with a lineup that spans scopes, PSUs, DMMs, signal
generators, and spectrum analyzers. SCPI conformance is **uneven across
families** — similar to Owon in its pain profile — so this pack leans on
profile-driven drivers with per-family quirks, a wider-than-usual
`*OPT?` refinement, and a conservative capability surface.

Ships as **Preview** in the 4.9 matrix; promote once community reports
land.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor coverage).
- Related:
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern.
  - [4-8-vendor-pack-owon.md](4-8-vendor-pack-owon.md) — nearest-neighbour pattern (budget-vendor narrow-capability posture).
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md) — supported-hardware surface.

## Target instruments

### Oscilloscope — GDS range

- **GDS-1000B / GDS-1054B / GDS-1074B** — entry 4-ch 50–70 MHz scopes.
- **GDS-2000E / GDS-2102E / GDS-2204E** — mid-range 2/4-ch scopes.
- **GDS-3000 / MSO-2000** — higher-tier with MSO add-ons (leave MSO
  digital channels on the feature-flag path from 4.7's InfiniiVision).
- **MPO-2000 / MDO-2000EX** — mixed-domain scopes with a thin SA /
  built-in SG option.

SCPI notes:

- Mostly 488.2-clean, but older GDS firmware sends waveform preambles
  in ASCII with a different field order than DHO800 / InfiniiVision.
  Driver needs a GW-specific preamble decoder.
- Trigger tree uses `TRIGger:SOURce` + `TRIGger:TYPE` with a reduced
  set compared to DHO800 / MSOX; the discriminated-union shape from
  2.7a handles it, but several subtypes will be absent.
- Decoder support: I²C / SPI / UART on GDS-2000E and up; CAN / LIN only
  on the GDS-3000 series.

### Power supply — GPP / GPD / PSW / PSS / PFR

- **GPP-1326 / GPP-2323 / GPP-3323 / GPP-4323** — triple / quad output
  linear PSUs with LAN.
- **GPD-3303S / GPD-4303S** — four-channel linear.
- **PSW30-72 / PSW160-14.4 etc.** — programmable switching PSUs, wider
  V / I envelope, LAN standard.
- **PFR-100L / PFR-100LM** — programmable-load PSU hybrids (gate under
  electronic-load façade if coverage matters).

SCPI notes:

- `:CHANnel<n>:VOLTage` + `:CHANnel<n>:CURRent` + `:OUTPut<n>:STATe`
  for GPP/GPD; `SOURce:VOLT` / `SOURce:CURR` for PSW.
- Preset slots: **`:MEMory:SAVE` / `:MEMory:RCL`** with a numbered
  argument on GPP; absent on GPD (reduced capability profile).
- OVP/OCP supported on GPP/PSW; absent on GPD.

### Multimeter — GDM range

- **GDM-8261A** — 5½-digit bench DMM with LAN.
- **GDM-8341 / GDM-9061 / GDM-9062** — 6½-digit bench DMMs.
- **GDM-906x** — upper-tier with dual-display + temperature transducers.

SCPI notes: reduced IVI-4.8-like surface. Dual display, math (null / dB /
dBm / stats / limit), and temperature transducers vary by model.
Trend-logging not exposed over SCPI on entry variants; gate the 2.6c
logging capability.

### Signal generator — AFG range

- **AFG-2000 / AFG-2105 / AFG-2125** — 5 / 25 MHz function generators.
- **AFG-3000 / AFG-3022 / AFG-3081 / AFG-3121** — dual-channel
  arbitrary waveform generators.
- **MFG-2230M / MFG-2260M** — multi-function gens with tracking / RF.

SCPI matches `SOURce<n>:FUNCtion`, `SOURce<n>:FREQuency`,
`SOURce<n>:AMPLitude`. Reuse 4.4 façade with a dedicated `Afg2000Profile`.

### Spectrum analyzer — GSP range

- **GSP-730** — entry 3 GHz SA.
- **GSP-9300 / GSP-9330** — mid-tier 3 GHz / 3.25 GHz SAs with tracking
  generator option.

Reuse 4.5 façade with a dedicated GW Instek profile; gate tracking
generator on `*OPT?` presence.

### Electronic load — PEL range

Optional sub-scope. **PEL-2000A / PEL-3000** programmable electronic
loads have LXI on selected SKUs. Profile-gate if included.

## Driver plan

- New `drivers/gw-instek/` package with `_shared/` helpers.
- Manufacturer regex: `/gw\s*instek|gwinstek|gw\s*-?\s*instek/i`
  (matches `GW Instek`, `GWINSTEK`, `GW-INSTEK`).
- Driver classes per family following the 4.2 pattern:
  `GwInstekGds`, `GwInstekGpp` (plus reduced sub-profile for GPD),
  `GwInstekPsw`, `GwInstekGdm`, `GwInstekAfg`, `GwInstekGsp`.
- Per-family profile types. Conservative catch-alls per family with
  narrow default capabilities — the GW Instek spread is wide enough
  that a too-permissive catch-all advertises capabilities the hardware
  doesn't have.
- Registry: per-variant + catch-all + legacy-GPD stripped-capability
  variant, longest-name-first.
- `refine*Profile` hooks probe `*OPT?` and selected tree roots
  (`MEASure?`, `SOURce<n>?`) to detect present-capability surface on
  legacy firmware where `*OPT?` is unreliable.

## Simulator plan

- `gwinstek-gds1054b`, `gwinstek-gds2102e`, `gwinstek-gpp4323`,
  `gwinstek-gdp4303s` (reduced GPD variant), `gwinstek-psw30-36`,
  `gwinstek-gdm9061`, `gwinstek-afg2125`, `gwinstek-gsp9330`
  personalities.
- Exercise GW Instek's ASCII-preamble waveform decode in at least one
  scope personality.

## Acceptance criteria

- [ ] Profile-driven drivers under `drivers/gw-instek/` cover the variant
      tables listed above for GDS, GPP, GPD (reduced), PSW, GDM, AFG,
      GSP families.
- [ ] Manufacturer regex resolves `GW Instek`, `GWINSTEK`, `GW-INSTEK`,
      and whitespace variants.
- [ ] Simulator personalities for representative variants round-trip
      core commands against the new drivers.
- [ ] `refine*Profile` hooks narrow capabilities against legacy firmware
      where `*OPT?` is unreliable.
- [ ] ASCII-preamble waveform decoder unit tested against GW Instek
      sample data.
- [ ] Reduced GPD profile does **not** advertise OVP / OCP / presets;
      driver rejects corresponding REST calls with 409.
- [ ] All GW Instek rows land in `docs/user/supported-hardware.md` with
      **Preview** status.
- [ ] New `packages/core/test/gw-instek-profiles.test.ts` iterates every
      variant and exercises each refiner + manufacturer regex.
- [ ] Extensions in `packages/sim/test/integration.test.ts` cover each
      new personality.

## Notes

- GW Instek's family-to-family SCPI consistency is the weakest of any
  vendor pack so far. Treat every family as if it were its own vendor
  and only merge shared helpers into `_shared/` when the pattern is
  genuinely shared (it usually isn't).
- MPO-2000 / MDO-2000EX mixed-domain scopes have a thin built-in SA; SA
  façade binding is optional and gate-able by `*OPT?` — do it last.
- PEL electronic loads are borderline scope for this pack; if including
  them adds significant effort, push to backlog and document the cut.
- The GDP vs GPP capability asymmetry is worth calling out explicitly
  in user docs — GPD is cheaper and narrower; the driver must not
  silently behave identically.
