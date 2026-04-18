# lxi-web

A browser dashboard for LXI-style LAN instruments (SCPI over TCP). Connect
an oscilloscope, a power supply, and a multimeter at once, see their live
state on a card grid, and expand any device for a full control panel. Typed
drivers ship for the **Rigol DHO804** (scope), **DP932E** (PSU), and
**DM858** (DMM); any other identifiable instrument falls back to a raw
SCPI console.

> **Not** a vendor replacement, **not** multi-user, **not** internet-exposed.
> Run it yourself on a trusted LAN.

## At a glance

- **Card grid dashboard** with live readouts (trigger state, rail voltages,
  primary reading) per connected instrument.
- **Typed panels** per device kind — scope (channels, timebase, trigger,
  acquisition, measurements, cursors, math/FFT, references, history,
  screenshots, presets, decoders), PSU (output, coupling, OVP/OCP,
  tracking, presets), DMM (modes, ranging + NPLC + auto-zero, triggering,
  math, dual display, trend logger + CSV export, temperature).
- **Raw SCPI** fallback for any identified LXI instrument we do not have
  a driver for, with confirm-on-`*RST` and no implicit system writes.
- **LAN discovery** via mDNS (Bonjour / DNS-SD). Scan, pick, connect.
- **Resilient sessions** — reconnect with a stable `sessionId` so URLs and
  subscriptions survive transient drops.
- **Browser-local address book** — save instruments, optionally
  auto-connect on launch. No server-side storage.

## Quick start

### Docker (recommended)

```bash
docker run --rm -p 8787:8787 ghcr.io/<owner>/lxi-web:latest
```

The server binds to `0.0.0.0:8787` inside the container. Open
`http://localhost:8787/`. See [docs/user/installation.md](docs/user/installation.md)
for reverse-proxy and LAN-binding notes.

> The container image ships in [Epic 3.6](docs/steps/3-6-docker-image-and-release.md);
> until it lands, use the from-source path below.

### From source

```bash
pnpm install
pnpm dev
```

- Web UI: `http://localhost:5173/`
- API:    `http://127.0.0.1:8787/`

Override the API bind with `HOST` / `PORT`:

```bash
HOST=0.0.0.0 PORT=9000 pnpm --filter @lxi-web/server dev
```

Only expose the API to a LAN you trust.

## Supported hardware

| Vendor | Model   | Kind           | Status         |
| ------ | ------- | -------------- | -------------- |
| Rigol  | DHO804  | Oscilloscope   | Verified       |
| Rigol  | DP932E  | Power supply   | Verified       |
| Rigol  | DM858   | Multimeter     | Verified       |
| Any    | *       | Identifiable   | Raw SCPI fallback |

Got other LXI gear? **[Report your hardware](.github/ISSUE_TEMPLATE/instrument-report.yml)**
— paste the `*IDN?` string, what works, what does not, and we can grow the
matrix.

## Architecture at a glance

```
Browser (Vue + Pinia)  <-- HTTP + WebSocket -->  Fastify server  <-- raw TCP -->  SCPI instruments
        UI state                                 SessionManager                    (DHO804, DP932E, DM858, …)
        live readouts                            device registry
        persisted address book                   mDNS discovery
```

More detail in [PLAN.md](PLAN.md) and [progress.md](progress.md).

## Documentation

- **User manual**: [docs/user/](docs/user/) — installation, first connect,
  per-kind pages, raw SCPI, troubleshooting, hardware reports, roadmap.
- **Design docs**: [docs/steps/](docs/steps/) — one file per substep in
  the implementation plan.
- **Public site**: GitHub Pages build under [docs/site/](docs/site/)
  (VitePress, reuses the same Markdown as `docs/user/`).

## Contributing

- **Bugs**: [bug report](.github/ISSUE_TEMPLATE/bug.yml).
- **New features**: [feature request](.github/ISSUE_TEMPLATE/feature.yml).
- **Instruments**: [hardware report](.github/ISSUE_TEMPLATE/instrument-report.yml).
- **Roadmap**: [progress.md](progress.md).

## License

[MIT](LICENSE).
