# lxi-web user manual

A browser dashboard for LXI-style LAN instruments. One dashboard, several
instruments, live readouts on a card grid, and a deep control panel per
device.

## Who it is for

- Solo engineers, makers, and small labs on a **trusted LAN**.
- People who already have LXI / SCPI instruments and want a modern UI
  without installing per-vendor software.

## What it cannot do

::: warning No accounts, no authentication
The dashboard is a single-operator tool for a trusted LAN. The LXI
instruments themselves have no auth on the SCPI TCP port, so adding
a login layer here would be misleading. **Never expose this dashboard
to the open internet.**
:::

- **No data retention** on the server — history lives in the browser tab
  or in CSV exports you trigger yourself.
- **Not a vendor replacement** — instrument-specific tuning that needs
  vendor drivers (firmware flashing, calibration) stays with the vendor.

## Read next

- [Installation](./installation.md) — Docker and from-source.
- [Getting started](./getting-started.md) — first connect walk-through.
- [Oscilloscope](./oscilloscope.md) / [Power supply](./power-supply.md)
  / [Multimeter](./multimeter.md) /
  [Electronic load](./electronic-load.md) /
  [Signal generator](./signal-generator.md) /
  [Spectrum analyzer](./spectrum-analyzer.md) — per-kind feature tour.
- [Raw SCPI](./raw-scpi.md) — the fallback for unknown instruments.
- [Troubleshooting](./troubleshooting.md) — common pitfalls.
- [Supported hardware](./supported-hardware.md) — the canonical
  compatibility matrix (Verified / Community / Preview / Reported).
- [Hardware reports](./hardware-reports.md) — how to file a report
  and move rows up the lifecycle.
- [Adding a driver](../contributing/adding-a-driver.md) — contributor
  guide for adding a variant / family / kind.
- [Roadmap](./roadmap.md) — what is next.
