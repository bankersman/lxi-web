# Roadmap

A user-facing mirror of the implementation checklist in
[`progress.md`](../../progress.md). The checklist is the source of
truth — this page just explains the larger themes.

## Shipped

- **Epic 1** — backend foundation: session manager, typed SCPI
  transport, device identity + routing, WebSocket feed.
- **Epic 2** — card-grid dashboard, per-kind panels for scope / PSU
  / DMM, raw SCPI fallback, advanced features.
- **Epic 3** — LAN discovery, resilient connectivity, saved
  connections, device detail UX, user manual + landing page, Docker
  image + release workflow, `@lxi-web/core` npm publishing.
- **Epic 4** — simulator framework (4.1), driver family + `*OPT?`
  refinement pattern (4.2), three new instrument kinds (4.3 eload,
  4.4 signal generator, 4.5 spectrum analyzer), seven vendor packs
  (4.6 Siglent, 4.7 Keysight + legacy Agilent, 4.8 Owon, 4.10
  Tektronix, 4.11 Rohde &amp; Schwarz + HAMEG legacy, 4.12 Fluke, 4.13
  GW Instek), and the
  [supported-hardware matrix](./supported-hardware.md) plus the
  [adding-a-driver guide](../contributing/adding-a-driver.md) (4.9).

## The Preview → Verified matrix is the social contract

New drivers ship as **Preview** — validated against the simulator,
never exercised against real metal. They advance through the matrix
as users file [hardware reports](./hardware-reports.md):

- `Preview` → `Community` when a user confirms a driver works on
  their unit.
- `Community` → `Verified` when a maintainer re-runs the driver on
  the physical unit and records the firmware + date.

This is the expected cadence for every future vendor / variant add.
No epics required — [adding a driver](../contributing/adding-a-driver.md)
is now a standard contributor workflow.

## In flight — Epic 4 vendor pack expansion

- **4.10 Tektronix** — TBS / MDO / MSO / DPO scopes, AFG function
  generators, PWS bench PSUs, MDO built-in SA.
- **4.11 Rohde & Schwarz (+ legacy Hameg)** — RTB / RTM / RTA / MXO
  scopes, NGE / NGL / NGM / NGP / NGU PSUs, HMC DMMs, SMA / SMB /
  SMBV and HMF / HMC804x signal generators, FPC / FPL / HMS SAs.
- **4.12 Fluke** — narrow DMM-centric pack (8808A / 8845A / 8846A /
  8588A / 8508A), optional calibrator sub-lane (5520A / 5522A /
  5730A).
- **4.13 GW Instek** — GDS scopes, GPP / GPD / PSW / PFR PSUs, GDM
  DMMs, AFG signal generators, GSP spectrum analyzers.

## Next — Epic 5 (bench safety) and Epic 6 (UX pass)

- **Epic 5 — bench safety.** Visible `SYST:ERR?` queue + per-session
  SCPI transcript (5.1); a big red **panic stop** button that
  disables every PSU / electronic-load / signal-generator output at
  once (5.2); a client-side **safe mode** toggle that disables every
  write-capable control across every detail page for demos and
  classroom use (5.3).
- **Epic 6 — UX pass.** Keyboard shortcuts with a discoverable help
  overlay (6.1); a detail-page information-architecture audit that
  puts hero readouts and safety-critical state first on every kind —
  PSU channels move from fifth to first, DMM primary / mode / range
  onto the hero row, etc. (6.2).

## Further out

- Additional instrument kinds beyond Epic 4: network analyzers, SMU,
  frequency counters, switch matrices, temperature loggers, LCR
  meters — same façade + registry + simulator + hardware-report
  pattern.
- More vendor packs once community hardware reports justify them.
- Deeper per-kind capabilities (PSU named presets, DMM digitize
  mode, scope pass/fail masks, MSO logic channels).
- **Epic X — cross-device orchestration (deferred).** Event bus,
  rule engine, sequences, correlated timeline, LXI trigger-bus
  research. Design retained; reprioritised behind Epics 5 and 6.
