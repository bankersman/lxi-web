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

Generator not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=signal-generator).

## Spectrum analyzers

| Vendor    | Family     | Variant                               | Status  | Notes |
| --------- | ---------- | ------------------------------------- | ------- | --- |
| Siglent   | SSA3000X   | SSA3015X / SSA3021X / SSA3032X / SSA3050X | Preview | 1.5 / 2.1 / 3.2 / 5.0 GHz. |
| Siglent   | SSA3000X-R | SSA3015X-R / SSA3021X-R / SSA3032X-R / SSA3050X-R | Preview | Tracking-generator variants. The TG facade itself is backlog — the SA sweep works today. |

Analyzer not listed? [File a hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml&kind=spectrum-analyzer).

## Port + discovery quick reference

| Vendor | Default SCPI port | mDNS (`_lxi._tcp` / `_scpi-raw._tcp`) |
| ------ | ----------------- | --- |
| Rigol    | 5555 | Usually advertised. |
| Siglent  | 5025 | Usually advertised. |
| Keysight (+ Agilent legacy) | 5025 | Usually advertised (LXI C/B class). |
| Owon     | **3000** | **Frequently absent.** Add instrument manually. |

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
