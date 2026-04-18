# lxi-web

A browser dashboard for LXI-style LAN instruments (SCPI over TCP). Connect an oscilloscope, a power supply, and a multimeter at once, see live state on a card grid, and expand any device for a full control panel. Typed drivers ship for Rigol DHO804, DP932E, and DM858; any other identified instrument falls back to a raw SCPI console.

## Audience and posture

Built for solo engineers, makers, and small labs on a trusted LAN. The backend holds the raw TCP sockets to your instruments and exposes HTTP + WebSocket to the browser. There is no multi-user auth in v1 — run it yourself and do not expose it to the open internet.

## Stack

- Node.js >= 24, TypeScript end-to-end
- Backend: Fastify + `@fastify/websocket`
- Frontend: Vue 3 + Vite + Vue Router + Tailwind + Pinia + Lucide + uPlot
- Monorepo: pnpm workspaces with `@lxi-web/core`, `@lxi-web/server`, `@lxi-web/web`

## Getting started

```bash
pnpm install
pnpm dev
```

The API server listens on `127.0.0.1:8787` by default. Override with `HOST` and `PORT`:

```bash
HOST=0.0.0.0 PORT=9000 pnpm --filter @lxi-web/server dev
```

Only expose the API to a LAN you trust.

## Progress

See [progress.md](./progress.md) for the current build status and [docs/steps/](./docs/steps) for per-step notes.
