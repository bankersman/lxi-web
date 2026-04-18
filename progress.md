# Progress

Living checklist mirroring the subplans. Update when a step finishes (check the box, leave a one-line summary).

## Foundations

- [x] **git-init** — `git init`, `.gitignore`, first commit.
- [x] **bootstrap-monorepo** — pnpm workspaces, `@lxi-web/core|server|web`, Fastify stub, Vue + Vite + Tailwind + Pinia + Router + Lucide + uPlot, docs scaffolding.

## Epic 1 — Generic client

- [x] **1.1 transport + SCPI core** — `TcpTransport` + `ScpiSession` (write, query, IEEE block). See [docs/steps/1-1-transport-and-scpi-core.md](docs/steps/1-1-transport-and-scpi-core.md).
- [x] **1.2 identity + routing** — `*IDN?`, device kind, registry → façade factory. See [docs/steps/1-2-identity-and-routing.md](docs/steps/1-2-identity-and-routing.md).
- [x] **1.3 typed façades** — `IOscilloscope`, `IPowerSupply`, `IMultimeter`. See [docs/steps/1-3-typed-facades.md](docs/steps/1-3-typed-facades.md).
- [x] **1.4 Rigol vendor pack** — DHO804 / DP932E / DM858. See [docs/steps/1-4-vendor-packs-rigol.md](docs/steps/1-4-vendor-packs-rigol.md).

## Epic 2 — Dashboard

- [x] **2.1 multi-session backend** — session manager keyed by `sessionId`. See [docs/steps/2-1-multi-session-backend.md](docs/steps/2-1-multi-session-backend.md).
- [x] **2.2 REST + WebSocket API** — connect/list/disconnect + WS broadcast of session updates, raw SCPI route, and typed routes per device kind. See [docs/steps/2-2-rest-and-websocket.md](docs/steps/2-2-rest-and-websocket.md).
- [x] **2.3 Vue shell** — card grid, status, light/dark toggle, Add-device dialog. See [docs/steps/2-3-vue-dashboard-shell.md](docs/steps/2-3-vue-dashboard-shell.md).
- [x] **2.4 session panels** — card mini-controls + expanded panels; scope uPlot; raw SCPI fallback. See [docs/steps/2-4-per-session-detail-views.md](docs/steps/2-4-per-session-detail-views.md).
- [x] **2.5 PSU advanced features** — channel coupling (series / parallel), OVP/OCP per channel (enable / threshold / trip / clear), CH1↔CH2 tracking, and 10-slot `*SAV`/`*RCL` preset memory — all exposed as optional capabilities on `IPowerSupply`, implemented on the Rigol DP900 driver, and surfaced in the detail page. See [docs/steps/2-5-psu-advanced-features.md](docs/steps/2-5-psu-advanced-features.md).

## Backlog — v2 and beyond

Items explicitly deferred from v1. Not committed to an order; pick up when the
relevant hardware or use case lands.

### New instrument kinds

- [ ] **Signal / function generators** — typed `ISignalGenerator` facade plus a
      first vendor driver.
- [ ] **Electronic loads** — typed `IElectronicLoad` facade (constant I / V /
      R / P modes, measurement streaming).
- [ ] **Spectrum / network analyzers** — typed facade for trace capture and
      marker queries.
- [ ] **Temperature / data loggers** — multi-channel rolling history with
      export.

### Discovery and connectivity

- [ ] **mDNS / VXI-11 / LXI discovery** — scan the LAN for instruments and
      offer a pick-list in the Add-device dialog instead of typed host/port.
- [ ] **Reconnect on transient network loss** — backoff + session resume so a
      Wi-Fi blip doesn't kill running captures.

### Advanced PSU features (extends 2.5)

- [x] **OVP / OCP** — per-channel enable, threshold, trip detect, clear-trip.
- [x] **Tracking** — `:OUTPut:TRACk` to slave CH2 set-values to CH1 without
      combining outputs.
- [x] **Preset memory** — `*SAV` / `*RCL` for saving and recalling full PSU
      state with numbered slots.
- [ ] **Named preset slots** — wrap `:MEMory:STORe` / `:MEMory:LOAD` so
      operators can name snapshots instead of remembering which slot is which.
- [ ] **OVP / OCP delay** — expose `:OUTPut:O[V|C]P:DELay` so fast transients
      don't nuisance-trip protection.

### Advanced scope features

- [ ] **Multi-channel overlay** — plot multiple enabled channels on one uPlot
      canvas with legend and per-channel color.
- [ ] **Math channels / FFT** — driver-dependent, starts with Rigol DHO.
- [ ] **Cursors and measurements** — on-chart time/voltage cursors plus a
      readout of common measurements (Vpp, frequency, rise time).

### Platform

- [ ] **Persistent layouts** — remember which devices were last connected and
      offer "reopen last session" on launch.
- [ ] **Recording / playback** — log instrument readouts to disk with CSV /
      Parquet export and an offline review mode.
- [ ] **Auth and multi-user** — only relevant if we drop the
      single-user / trusted-LAN posture.
