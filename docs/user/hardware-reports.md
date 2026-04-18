# Hardware reports

Hardware reports are how we grow the
[supported-hardware matrix](./supported-hardware.md). The project
ships typed drivers for a steadily-growing catalog of Rigol / Siglent
/ Keysight / Owon / Tektronix / Rohde &amp; Schwarz / Fluke / GW Instek
instruments; anything outside that catalog falls
back to a typed identity card plus the raw SCPI console. A hardware
report is what turns a new-to-us instrument into either a **new row**
(community-contributed driver) or a **status bump** on an existing
row (`Preview` → `Community` → `Verified`).

## The status lifecycle

Every driver row on the supported-hardware matrix carries one of four
status values:

- **Preview** — the default for new drivers. Validated against the
  simulator, never exercised against real metal.
- **Community** — a user filed a report confirming the driver works on
  their physical unit. Maintainer has not re-verified.
- **Verified** — a maintainer has exercised the driver against the
  physical unit end-to-end and recorded the firmware version + date in
  the Notes column.
- **Reported** — someone captured the `*IDN?` / `*OPT?` / a raw SCPI
  log but no driver exists yet. Raw SCPI works; typed panels do not.

Reports move rows up this ladder. That is literally the whole social
contract.

## How `*IDN?` matching works

The server asks every new connection `*IDN?` and parses the response
into `manufacturer / model / serial / firmware`. A registry maps
`(manufacturer, modelPattern)` tuples to a device kind, a family
profile, and a driver class. Some drivers then run a second
[refinement probe](../steps/4-2-driver-family-profiles.md) — typically
`*OPT?` plus a channel-count query — to narrow the capability surface
on licensed / downgraded units.

Unknown entries route to the raw SCPI console but **still** get a
typed identity card on the dashboard, so your hardware report can
always start from a real `*IDN?` capture regardless of matrix status.

## Filing a report

Use the
[instrument-report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml)
issue template. The template asks for exactly the fields a maintainer
needs — please fill them in rather than condensing:

- **`*IDN?` response** — verbatim, copy from the overview card on the
  device page or the raw SCPI console.
- **`*OPT?` response** — also verbatim. Many drivers use this to widen
  / narrow the capability surface per license; without it the matrix
  entry has to assume the conservative configuration.
- **Firmware version** — typically the 4th field of `*IDN?`. We
  sometimes need to know which firmware was tested because Owon /
  Siglent / GW Instek firmwares drift between major revisions, and
  Fluke 8500-series reference DMMs + legacy 55xx calibrators require
  **CR+LF termination** that we pin per firmware.
- **Vendor + model + device kind** — the category dropdown drives the
  label we put on the matrix row.
- **Report kind** — is this a first hardware report, a firmware-update
  regression, or an explicit request to promote `Preview` → `Verified`?
- **What worked / what failed** — which panels, which controls, which
  commands errored. Screenshots welcome. Raw SCPI transcripts are ideal
  for anything surprising.
- **Dashboard build** — Docker image digest (`ghcr.io/…@sha256:…`) or a
  `git rev-parse HEAD` for source builds, so we can reproduce behaviour
  against the exact code that ran.

## From report to matrix change

What a maintainer does when a report lands:

1. **Capture the fixture.** Paste the `*IDN?` / `*OPT?` / any surprising
   SCPI into a test fixture under `packages/core/test/` or
   `packages/sim/personalities/<vendor>/<sku>.fixture.json` (for
   personalities that load fixtures). This is what guarantees future
   regressions surface during CI even without the hardware still
   being plugged in.
2. **Confirm the resolver.** Run the existing
   `packages/core/test/<vendor>-profiles.test.ts` against the new IDN
   string — the matrix entry is only honest if the registry actually
   picks the right variant / family / kind.
3. **Add a simulator personality** if one doesn't already cover the
   SKU. For variants that reuse an existing family dialect this is a
   minute of work — copy the closest sibling, swap the IDN string, and
   register it in `packages/sim/personalities/index.ts`.
4. **Flip the matrix row.** `Preview` → `Community` if the report came
   from a user; `Community` → `Verified` if the maintainer rebuilt the
   unit on their bench. Record firmware + date in the Notes column so
   we have a running compatibility history.
5. **Open a tracking issue** only if the report uncovers a driver gap
   (missing capability, wrong SCPI, firmware quirk). A plain promotion
   report does not need a tracking issue — the matrix commit is the
   artifact.

## Expediting a promotion

Reports with a **full SCPI capture** of the thing you did get
`Preview` → `Verified` in a single round-trip more often than reports
that only describe what happened. The
[raw SCPI console](./raw-scpi.md) can mirror every command the
dashboard issues — paste that transcript into the report and the
maintainer can replay it against the simulator before touching the
hardware.

If you have multiple instruments from the same family (e.g. two
different SDS HD scopes), filing one report per unit with the
per-unit firmware version is more useful than a single "the whole
family works" report — firmware drift between SKUs is the usual
reason a family status does not apply cleanly to every variant.
