# Supported hardware

The **canonical compatibility list** for lxi-web. If you are trying to
decide whether an instrument you own will work today, this is the page
to read.

Anything with a status other than **Verified** benefits from a
[hardware report](./hardware-reports.md) — that is the mechanism by
which `Preview` → `Community` → `Verified` happens.

## Status lifecycle

| Status        | Meaning |
| ------------- | --- |
| **Verified**  | Driver exercised against real hardware by a maintainer and confirmed working end-to-end. Firmware + date of the last verification is recorded in the Notes column. |
| **Community** | A user filed a [hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml) confirming the driver works on their unit, but a maintainer has not re-verified it yet. |
| **Preview**   | Driver + simulator personality ship, but no real unit has been confirmed. Safe to try — the raw SCPI console is always there as a fallback. |
| **Reported**  | Someone sent a `*IDN?` capture and a SCPI log; no driver has been written yet. Raw SCPI works; typed panels do not. |

New drivers ship as **Preview** and rely on hardware reports to advance.
Every Preview row carries a "no hardware test yet — please file a
report" CTA. There is intentionally no UI pill in the app itself; the
status lives in documentation so it can be updated per-report without a
release.

Something you use is missing? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml)
with your `*IDN?` response, `*OPT?` output, and firmware version.

## Oscilloscopes

| Vendor    | Family           | Variant         | Status  | Notes |
| --------- | ---------------- | --------------- | ------- | --- |
| Rigol     | DHO800           | DHO804          | Verified | 4 ch / 70 MHz. Full decoder + measurement catalog. |
| Rigol     | DHO800           | DHO802          | Preview | 2 ch / 70 MHz. Resolves through the shared DHO800 driver. |
| Rigol     | DHO800           | DHO812          | Preview | 2 ch / 100 MHz. |
| Rigol     | DHO800           | DHO814          | Preview | 4 ch / 100 MHz. |
| Siglent   | SDS (HD / SCPI-2000) | SDS814X-HD  | Preview | 4 ch / 100 MHz / 12-bit HD. |
| Siglent   | SDS (HD / SCPI-2000) | SDS824X-HD  | Preview | 4 ch / 200 MHz / 12-bit HD. |
| Siglent   | SDS (HD / SCPI-2000) | SDS2354X-HD | Preview | 4 ch / 350 MHz / 12-bit HD. |
| Siglent   | SDS (HD / SCPI-2000) | SDS3054X-HD | Preview | 4 ch / 500 MHz / 12-bit HD. |
| Siglent   | SDS (SCPI-2000)  | SDS2104X-Plus   | Preview | 4 ch / 100 MHz / 8-bit. |
| Siglent   | SDS (SCPI-2000)  | SDS6104A        | Preview | 4 ch / 1 GHz / 8-bit. |
| Siglent   | SDS (SCPI-2000)  | SDS6204A        | Preview | 4 ch / 2 GHz / 8-bit. |
| Siglent   | SDS (legacy X-E) | SDS1104X-E      | Preview | 4 ch / 100 MHz. Legacy `C1:VDIV` / `WFSU` dialect — best-effort. |
| Siglent   | SDS (legacy X-E) | SDS1204X-E      | Preview | 4 ch / 200 MHz. Same legacy dialect as 1104X-E. |
| Keysight  | InfiniiVision 1000X | DSOX1102A / 1102G / 1204A / 1204G | Preview | 70 MHz entry line. DSO-only, 1–2 decoder buses. |
| Keysight  | InfiniiVision 2000X | DSOX2002A–2024A | Preview | 70–200 MHz DSO-only. Tolerates `DSO-X 2024A` / `DSOX2024A` / `DSOX 2024A` formats. |
| Keysight  | InfiniiVision 2000X | MSOX2002A–2024A | Preview | MSO variant — 8 logic lanes. |
| Keysight  | InfiniiVision 3000T | DSOX3024T–3104T | Preview | 200 MHz – 1 GHz, 5 GSa/s. |
| Keysight  | InfiniiVision 3000T | MSOX3024T–3104T | Preview | MSO variant — 16 logic lanes. |
| Keysight  | InfiniiVision 4000X | DSOX4024A–4154A | Preview | 200 MHz – 1.5 GHz. Bandwidth-limit option `200M` honoured. |
| Keysight  | InfiniiVision 4000X | MSOX4024A–4154A | Preview | MSO variant — 16 logic lanes. |
| Keysight  | InfiniiVision 6000X | DSOX6002A–6014A | Preview | 1 – 2.5 GHz, 20 GSa/s. |
| Keysight  | InfiniiVision 6000X | MSOX6002A–6014A | Preview | MSO variant — 16 logic lanes. |
| Owon      | XDS3000          | XDS3102A        | Preview | 4 ch / 100 MHz. **Listens on TCP port 3000**. Partial LXI conformance — mDNS often absent; add manually. No decoders / references / history. |
| Owon      | XDS3000          | XDS3104AE       | Preview | 4 ch / 100 MHz. Same caveats as XDS3102A. IDN sometimes advertises "Lilliput Electronics" (Owon's parent). |
| Tektronix | TBS2000B         | TBS1052C / TBS1072C / TBS1102C / TBS1202C | Preview | 50 – 200 MHz 2 ch / 8-bit. IEEE 488.2 definite-length waveforms. |
| Tektronix | TBS2000B         | TBS2072B / TBS2102B / TBS2074B / TBS2104B / TBS2204B | Preview | 70 – 200 MHz, 2 / 4 ch. |
| Tektronix | MDO3000          | MDO3012 / MDO3104 | Preview | 100 MHz – 1 GHz. Optional built-in spectrum (not yet wired). |
| Tektronix | MDO4000C         | MDO4024C / MDO4054C / MDO4104C | Preview | 200 MHz – 1 GHz, 5 GSa/s. |
| Tektronix | DPO/MSO2000B     | DPO2024B / MSO2024B | Preview | 200 MHz, 1 GSa/s. MSO has 16 logic lanes. |
| Tektronix | DPO/MSO3000      | DPO3034 / MSO3054 | Preview | 300 – 500 MHz. |
| Tektronix | DPO/MSO4000B     | DPO4054B / MSO4104B | Preview | 500 MHz – 1 GHz, 16 logic lanes on MSO. |
| Tektronix | MSO5/6 Series    | MSO54 / MSO56 / MSO58 / MSO64B / MSO68B | Preview | 350 MHz – 10 GHz FlexChannel. SCPI-99 tree; high-res ADC variants share the driver. |
| R&amp;S     | RTB2000          | RTB2002 / RTB2004 | Preview | 70 – 300 MHz, 2 / 4 ch, 10-bit. |
| R&amp;S     | RTM3000 / RTA4000 | RTM3002 / RTM3004 / RTA4004 | Preview | 100 MHz – 1 GHz, up to 16-bit HD. |
| R&amp;S     | MXO              | MXO44 / MXO54 / MXO58 | Preview | 1.5 – 6 GHz, 5 GSa/s, 12-bit. |
| R&amp;S     | HMO (HAMEG legacy) | HMO1002 / HMO1202 / HMO2024 | Preview | 70 – 200 MHz, 1 GSa/s. Manufacturer regex accepts `HAMEG Instruments`. |
| GW Instek | GDS-1000B        | GDS-1054B / GDS-1074B | Preview | 50 / 70 MHz, 4 ch. `:CHANnel<n>:MEMory?` returns a GW-specific ASCII preamble; driver decodes the format directly. |
| GW Instek | GDS-2000E        | GDS-2102E / GDS-2204E | Preview | 100 / 200 MHz, 2 / 4 ch. Serial decoders (I²C / SPI / UART). |
| GW Instek | GDS-3000         | GDS-3352 | Preview | 350 MHz, 5 GSa/s, CAN / LIN decoders. |
| GW Instek | MSO-2000         | MSO-2204 | Preview | 200 MHz + 16-channel logic pod. |
| GW Instek | MDO-2000EX       | MDO-2302EX | Preview | 300 MHz scope + narrow built-in spectrum (SA surface backlog). |

Scope not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=oscilloscope) — the **Device kind** dropdown is pre-selected for you.

## Power supplies

| Vendor    | Family  | Variant   | Status  | Notes |
| --------- | ------- | --------- | ------- | --- |
| Rigol     | DP900   | DP932E    | Verified | 3 ch (30 V / 3 A ×2 + 6 V / 3 A). Pairing + tracking + presets. |
| Rigol     | DP900   | DP932U    | Reported | Same-limits USB-only SKU; LAN variant only resolves if the unit exposes LXI. |
| Rigol     | DP900   | DP912     | Preview | 2 ch (30 V / 3 A ×2). |
| Siglent   | SPD     | SPD3303X-E | Preview | 3 ch. CH1/CH2 series + parallel + tracking; CH3 fixed 5 V rail. |
| Siglent   | SPD     | SPD3303X  | Preview | 3 ch. Same layout as SPD3303X-E, newer firmware. |
| Siglent   | SPD     | SPD3303C  | Preview | 3 ch. Older firmware — `:SYSTem:CHANnel:COUNt?` often unanswered; refine hook falls back gracefully. |
| Siglent   | SPD     | SPD1168X  | Preview | 1 ch, 16 V / 8 A. No pairing / tracking. |
| Siglent   | SPD     | SPD1305X  | Preview | 1 ch, 30 V / 5 A. |
| Keysight  | E36 / EDU | EDU36311A | Preview | 3 ch educational (6 V / 5 A + ±25 V / 1 A). Pairing + tracking + presets. |
| Keysight  | E36100  | E36102A / E36103A / E36104A / E36105A / E36106A | Preview | 1 ch LXI singles. Presets + OVP / OCP. |
| Keysight  | E36300  | E36311A / E36312A / E36313A | Preview | Triple-output programmable. Pairing + tracking + presets. |
| Keysight  | E364x (legacy Agilent) | E3640A / E3641A / E3642A | Preview | Legacy Agilent single-output LXI. Manufacturer regex accepts `Agilent Technologies`. |
| Owon      | SPE     | SPE3103   | Preview | Triple (30 V / 3 A ×2 + 5 V / 3 A). **Port 3000**, mDNS often absent. No pairing / tracking / OVP-OCP over SCPI. |
| Owon      | SPE     | SPE3051   | Preview | Triple (30 V / 5 A ×2 + 5 V / 3 A). Same caveats. |
| Owon      | SPE     | SPE6053   | Preview | 1 ch, 60 V / 5 A. |
| Owon      | SPE     | SPE6103   | Preview | 1 ch, 60 V / 10 A. |
| Tektronix | PWS2000 | PWS2185 / PWS2323 / PWS2326 / PWS2721 | Preview | 1 ch 18 / 32 / 72 V. No presets / pairing. |
| Tektronix | PWS4000 | PWS4205 / PWS4305 / PWS4323 / PWS4602 / PWS4721 | Preview | 1 ch 20 – 72 V with OVP + 9-slot preset memory. |
| R&amp;S     | NGE100 / NGE200 | NGE102B / NGE103B | Preview | 2 / 3 ch, 32 V / 3 A. Per-channel OVP + preset memory. |
| R&amp;S     | NGL / NGM       | NGL201 / NGL202 / NGM201 / NGM202 | Preview | Source-measure (2Q for NGL, 4Q for NGM), 20 V / 6 A per channel. |
| R&amp;S     | NGP800          | NGP804 / NGP814 | Preview | 4 ch programmable, 64 V / 20 A, list mode (backlog). |
| R&amp;S     | NGU (SMU)       | NGU201 / NGU401 | Preview | Single-ch source-measure, 20 V / 250 V. |
| R&amp;S     | HMP / HMC (HAMEG legacy) | HMP2030 / HMC8043 | Preview | Legacy HAMEG tree behind the NGE driver. Manufacturer regex accepts `HAMEG Instruments`. |
| Fluke     | 5500 / 5700 (calibrators) | 5520A / 5522A / 5730A | Preview | Multi-function calibrators. Modeled as a power-supply facade; the 57xx high-accuracy features (artifact cal, scope option) are out of scope. |
| GW Instek | GPP     | GPP-1326 / GPP-2323 / GPP-3323 / GPP-4323 | Preview | 1 – 4 ch linear, OVP / OCP + preset memory. |
| GW Instek | GPD (economy) | GPD-3303S / GPD-4303S | Preview | Economy linear PSUs — **no OVP / OCP, no presets**. Driver gates those capabilities off. |
| GW Instek | PSW     | PSW30-36 / PSW30-72 / PSW160-14.4 | Preview | Single-channel switching, 30 – 160 V / up to 72 A. Uses the SCPI-1999 `SOURce:*` tree. |

PSU not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=power-supply).

## Multimeters

| Vendor    | Family      | Variant  | Status  | Notes |
| --------- | ----------- | -------- | ------- | --- |
| Rigol     | DM800       | DM858    | Verified | 6½-digit. Full mode / range / NPLC / math / logging / dual-display surface. |
| Rigol     | DM800       | DM858E   | Preview | Drops 4-wire resistance unless `DM-4W` license present (refine hook re-adds it on licensed units). |
| Siglent   | SDM         | SDM3045X | Preview | 4½-digit. No 4-wire resistance. |
| Siglent   | SDM         | SDM3055  | Preview | 5½-digit. |
| Siglent   | SDM         | SDM3065X | Preview | 6½-digit. |
| Siglent   | SDM         | SDM3065X-SC | Preview | 6½-digit + SC-1094 scanner card. Scan-list UI is backlog; DMM behaviour matches SDM3065X. |
| Keysight  | Truevolt    | 34450A   | Preview | 5½-digit. No 4-wire. Reduced transducer list. |
| Keysight  | Truevolt    | 34461A   | Preview | 6½-digit. |
| Keysight  | Truevolt    | 34465A   | Preview | 6½-digit. Digitize + histogram capabilities advertised. |
| Keysight  | Truevolt    | 34470A   | Preview | 7½-digit. Digitize + histogram capabilities advertised. |
| Keysight  | Truevolt (legacy Agilent) | 34410A | Preview | 6½-digit. No capacitance / temperature / dual-display. Manufacturer regex accepts `Agilent Technologies`. |
| Keysight  | Truevolt (legacy Agilent) | 34411A | Preview | High-speed sibling of 34410A. |
| Owon      | XDM         | XDM1041  | Preview | 4½-digit. No 4-wire / temperature / presets. **Port 3000**; blank manufacturer on some firmware drops — model-only fallback in registry. |
| Owon      | XDM         | XDM1241  | Preview | 4½-digit. Same surface as XDM1041; extra sample memory. |
| Owon      | XDM         | XDM2041  | Preview | 5½-digit. Adds 4-wire resistance and 5 preset slots. |
| R&amp;S     | HMC8000     | HMC8012  | Preview | 5¾-digit bench DMM. Reuses the HAMEG legacy SCPI tree. |
| R&amp;S     | HMC8000     | HMC8015  | Preview | Power analyzer with DMM mode exposed through the HMC driver. |
| Fluke     | 8800 (bench) | 8808A   | Preview | 5½-digit. Legacy 48xx firmware — CR+LF termination. No capacitance. |
| Fluke     | 8800 (bench) | 8845A / 8846A | Preview | 6½-digit. 8846A adds capacitance + temperature. |
| Fluke     | 8500 (reference) | 8588A / 8508A | Preview | 8½-digit reference DMMs. CR+LF termination; metrology-grade. Autozero / autocal exposed through preset facades. |
| GW Instek | GDM-8000    | GDM-8261A | Preview | 5½-digit. No capacitance / temperature / math / dual display. |
| GW Instek | GDM-8000    | GDM-8341 | Preview | 5½-digit with dual display + math + temperature. |
| GW Instek | GDM-9000    | GDM-9061 / GDM-9062 | Preview | 6½-digit. Full IVI-4.8 surface including dual display, math, temperature, and preset memory. |

DMM not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=multimeter).

## Electronic loads

| Vendor    | Family | Variant     | Status  | Notes |
| --------- | ------ | ----------- | ------- | --- |
| Rigol     | DL3000 | DL3021      | Preview | 150 V / 40 A / 200 W. CC/CV/CR/CP + OVP/OCP/OPP/OTP + dynamic + battery discharge. |
| Rigol     | DL3000 | DL3031      | Preview | 150 V / 60 A / 350 W. |
| Siglent   | SDL    | SDL1020X-E  | Preview | 200 W. No list mode. |
| Siglent   | SDL    | SDL1020X    | Preview | 200 W + list mode. |
| Siglent   | SDL    | SDL1030X-E  | Preview | 300 W. No list mode. |
| Siglent   | SDL    | SDL1030X    | Preview | 300 W + list mode. |
| Keysight  | EL3    | EL34143A    | Preview | 1 ch, 150 V / 40 A / 350 W. CC/CV/CR/CP + OVP/OCP/OPP. |
| Keysight  | EL3    | EL34243A    | Preview | 2 ch, 150 V / 40 A / 300 W per channel. |

Load not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=electronic-load).

## Signal / arbitrary waveform generators

| Vendor    | Family        | Variant                         | Status  | Notes |
| --------- | ------------- | ------------------------------- | ------- | --- |
| Rigol     | DG800         | DG811 / DG812                   | Preview | 1–2 ch / 10 MHz. Sine / square / ramp / pulse / noise / DC / arbitrary. |
| Rigol     | DG800         | DG821 / DG822                   | Preview | 25 MHz. |
| Rigol     | DG800         | DG831 / DG832                   | Preview | 35 MHz. |
| Rigol     | DG900         | DG922 / DG932 / DG952 / DG972   | Preview | 25 / 35 / 50 / 70 MHz, 250 MSa/s, 16 Msa arb. |
| Siglent   | SDG (1000X)   | SDG1032X / SDG1062X             | Preview | 30 / 60 MHz, 2 ch. Legacy `Cn:BSWV` dialect. |
| Siglent   | SDG (2000X)   | SDG2042X / SDG2082X / SDG2122X  | Preview | 40 / 80 / 120 MHz. |
| Siglent   | SDG (6000X)   | SDG6022X / SDG6052X             | Preview | 200 / 500 MHz. |
| Keysight  | Trueform 33500B | 33509B / 33510B / 33511B / 33512B / 33521B / 33522B | Preview | 20 – 30 MHz, 64k – 1M arb memory. |
| Keysight  | Trueform 33600A | 33611A / 33612A / 33621A / 33622A | Preview | 80 / 120 MHz, 1 GSa/s, 4 Msa arb. |
| Tektronix | AFG1000   | AFG1022 / AFG1062  | Preview | 25 / 60 MHz, 2 ch, 14-bit. |
| Tektronix | AFG3000C  | AFG3011C – AFG3252C | Preview | 10 MHz – 240 MHz, 1 / 2 ch, 14-bit. Full SOURce/FUNCtion tree. |
| Tektronix | AFG31000  | AFG31021 – AFG31252 | Preview | 25 MHz – 250 MHz, 14-bit / 16-bit with 128 Msa arb + sequence mode (backlog). |
| R&amp;S     | HMF (HAMEG legacy) | HMF2525 / HMF2550 | Preview | 25 / 50 MHz, 1 ch. Legacy HAMEG tree. |
| R&amp;S     | SMA / SMB / SMBV (RF signal generators) | SMA100A / SMA100B / SMB100A / SMBV100A / SMBV100B | Preview | 1 MHz – 40 GHz RF synthesis. Modulation tree (AM / FM / PM / PULM) is backlog — CW output works today. |
| GW Instek | AFG-2000  | AFG-2005 / AFG-2105 / AFG-2125 | Preview | 5 / 25 MHz, 1 ch. AFG-2005 is sine-only, no arbitrary / presets. |
| GW Instek | AFG-3000  | AFG-3021 / AFG-3022 / AFG-3081 / AFG-3121 | Preview | 20 – 120 MHz, 1 / 2 ch, 14-bit arb. |
| GW Instek | MFG-2000  | MFG-2230M / MFG-2260M | Preview | 30 / 60 MHz multi-channel with modulation. Arbitrary via `FUNCtion USER`. |

Generator not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=signal-generator).

## Spectrum analyzers

| Vendor    | Family     | Variant                               | Status  | Notes |
| --------- | ---------- | ------------------------------------- | ------- | --- |
| Siglent   | SSA3000X   | SSA3015X / SSA3021X / SSA3032X / SSA3050X | Preview | 1.5 / 2.1 / 3.2 / 5.0 GHz. |
| Siglent   | SSA3000X-R | SSA3015X-R / SSA3021X-R / SSA3032X-R / SSA3050X-R | Preview | Tracking-generator variants. The TG facade itself is backlog — the SA sweep works today. |
| R&amp;S     | FPC / FPL / HMS | FPC1000 / FPC1500 / FPL1003 / FPL1007 / FPL1014 / HMS1000 / HMS3000 | Preview | 1 – 26.5 GHz entry analyzers. FPC and HMS legacy units share the FPC driver. |
| GW Instek | GSP        | GSP-730 / GSP-9300 / GSP-9330 | Preview | 3 – 3.25 GHz. `*OPT?` reports the optional tracking generator on the 9330; the driver exposes TG capability when present. |

Analyzer not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=spectrum-analyzer).

## Port + discovery quick reference

| Vendor | Default SCPI port | mDNS (`_lxi._tcp` / `_scpi-raw._tcp`) |
| ------ | ----------------- | --- |
| Rigol    | 5555 | Usually advertised. |
| Siglent  | 5025 | Usually advertised. |
| Keysight (+ Agilent legacy) | 5025 | Usually advertised (LXI C/B class). |
| Owon     | **3000** | **Frequently absent.** Add instrument manually. |
| Tektronix | 4000 | Usually advertised on LXI-class units; older TBS/PWS benches often require manual entry. |
| R&amp;S (+ HAMEG legacy) | 5025 | Usually advertised on LXI-C units. HMC / HMF / HMO legacy benches occasionally omit mDNS. |
| Fluke    | 3490 (488.2) / 5025 (LXI) | Varies by family. 55xx calibrators historically wrap 488.2 over LAN — expect **CR+LF termination** on 8500-series reference DMMs and older calibrators. |
| GW Instek | 1026 | Usually advertised on GDS / GSP / GPP units; older GDS-1000B and GPD economy supplies frequently require manual entry. |

See [troubleshooting.md](./troubleshooting.md) for manual-entry recipes
and [hardware-reports.md](./hardware-reports.md) for how to bump a
Preview entry to Community / Verified.

## What "raw SCPI fallback" covers

Any instrument that answers `*IDN?` — even one that never appears in
this matrix — still shows up on the dashboard with a typed identity
card and a [raw SCPI console](./raw-scpi.md). Typed per-kind panels
(scope mini-card, PSU channel strip, DMM big-number readout) are only
available for the drivers listed above; unsupported SKUs stay on the
raw console until a driver lands.

## Contributing a driver

See [contributing/adding-a-driver.md](../contributing/adding-a-driver.md)
for the end-to-end workflow: profile tables, registry entries,
simulator personalities, tests, and matrix updates.
