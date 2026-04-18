# lxi-web user manual

A browser dashboard for LXI-style LAN instruments. One dashboard, several
instruments, live readouts on a card grid, and a deep control panel per
device.

## Who it is for

- Solo engineers, makers, and small labs on a **trusted LAN**.
- People who already have LXI / SCPI instruments and want a modern UI
  without installing per-vendor software.

## What it cannot do

- **No multi-user / auth / RBAC** — the API is unauthenticated by design.
  Never expose it to the open internet.
- **No data retention** on the server — history lives in the browser tab
  or in CSV exports you trigger yourself.
- **Not a vendor replacement** — instrument-specific tuning that needs
  vendor drivers (firmware flashing, calibration) stays with the vendor.

## Read next

- [Installation](./installation.md) — Docker and from-source.
- [Getting started](./getting-started.md) — first connect walk-through.
- [Oscilloscope](./oscilloscope.md) / [Power supply](./power-supply.md)
  / [Multimeter](./multimeter.md) /
  [Electronic load](./electronic-load.md) — per-kind feature tour.
- [Raw SCPI](./raw-scpi.md) — the fallback for unknown instruments.
- [Troubleshooting](./troubleshooting.md) — common pitfalls.
- [Hardware reports](./hardware-reports.md) — how to get your
  instrument verified.
- [Roadmap](./roadmap.md) — what is next.
