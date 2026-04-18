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
  4.4 signal generator, 4.5 spectrum analyzer), three vendor packs
  (4.6 Siglent, 4.7 Keysight + legacy Agilent, 4.8 Owon), and the
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

## Further out — Epic 5 and beyond

- **Epic 5** — cross-device orchestration (event bus, rule engine,
  sequences, correlated timeline, LXI trigger-bus research).
- Additional instrument kinds beyond Epic 4: network analyzers, SMU,
  frequency counters, switch matrices, temperature loggers, LCR
  meters — same façade + registry + simulator + hardware-report
  pattern.
- More vendor packs once community hardware reports justify them.
- Deeper per-kind capabilities (PSU named presets, DMM digitize
  mode, scope pass/fail masks, MSO logic channels).
