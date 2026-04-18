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

## In progress — Epic 4: simulator, families, new kinds, vendors

Epic 4 widens hardware coverage without requiring the maintainer to
own every supported SKU. Four outcomes:

1. A **simulator framework** rich enough that any new driver can be
   exercised end-to-end without lab hardware (4.1).
2. A **driver family** pattern that replaces one-file-per-SKU with
   profile tables and `*OPT?`-based refinement at connect time (4.2).
3. Three **new instrument kinds** — electronic load (4.3), signal /
   arbitrary waveform generator (4.4), spectrum analyzer (4.5).
4. Three **vendor packs** — Siglent (4.6), Keysight + legacy Agilent
   (4.7), Owon (4.8).

A final step (4.9) folds everything into a
[supported-hardware matrix](./hardware-reports.md) with a
**Preview → Community → Verified** status lifecycle. Drivers
validated only against the simulator ship as **Preview** and flip to
**Verified** once a user files a hardware report confirming they
work on real gear.

## Further out

- **Epic 5** — cross-device orchestration (event bus, rule engine,
  sequences, correlated timeline, LXI trigger-bus research).
- Additional instrument kinds beyond Epic 4: network analyzers, SMU,
  frequency counters, switch matrices, temperature loggers, LCR
  meters — same façade + registry + simulator + hardware-report
  pattern.
- More vendor packs once community hardware reports justify them.
- Deeper per-kind capabilities (PSU named presets, DMM digitize
  mode, scope pass/fail masks, MSO logic channels).
