# Progress

Living checklist mirroring the subplans. Update when a step finishes (check the box, leave a one-line summary).

## Foundations

- [x] **git-init** — `git init`, `.gitignore`, first commit.
- [x] **bootstrap-monorepo** — pnpm workspaces, `@lxi-web/core|server|web`, Fastify stub, Vue + Vite + Tailwind + Pinia + Router + Lucide + uPlot, docs scaffolding.

## Epic 1 — Generic client

- [ ] **1.1 transport + SCPI core** — `TcpTransport` + `ScpiSession` (write, query, IEEE block). See [docs/steps/1-1-transport-and-scpi-core.md](docs/steps/1-1-transport-and-scpi-core.md).
- [ ] **1.2 identity + routing** — `*IDN?`, device kind, registry → façade factory. See [docs/steps/1-2-identity-and-routing.md](docs/steps/1-2-identity-and-routing.md).
- [ ] **1.3 typed façades** — `IOscilloscope`, `IPowerSupply`, `IMultimeter`. See [docs/steps/1-3-typed-facades.md](docs/steps/1-3-typed-facades.md).
- [ ] **1.4 Rigol vendor pack** — DHO804 / DP932E / DM858. See [docs/steps/1-4-vendor-packs-rigol.md](docs/steps/1-4-vendor-packs-rigol.md).

## Epic 2 — Dashboard

- [ ] **2.1 multi-session backend** — session manager keyed by `sessionId`. See [docs/steps/2-1-multi-session-backend.md](docs/steps/2-1-multi-session-backend.md).
- [ ] **2.2 REST + WebSocket API** — connect/list/disconnect + WS multiplexed by `sessionId`. See [docs/steps/2-2-rest-and-websocket.md](docs/steps/2-2-rest-and-websocket.md).
- [ ] **2.3 Vue shell** — card grid, status, light/dark toggle, Add-device dialog. See [docs/steps/2-3-vue-dashboard-shell.md](docs/steps/2-3-vue-dashboard-shell.md).
- [ ] **2.4 session panels** — card mini-controls + expanded panels; scope uPlot; raw SCPI fallback. See [docs/steps/2-4-per-session-detail-views.md](docs/steps/2-4-per-session-detail-views.md).
