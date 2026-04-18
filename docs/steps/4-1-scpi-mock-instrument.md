# 4.1 — SCPI mock instrument (TCP)

## Goal

Provide **in-repo TCP peer(s)** that speak enough **SCPI** to exercise the full
stack — connect, `*IDN?`, session routing, typed routes, WebSocket updates —
**without** Rigol hardware. Usable from **local dev** and **CI** (headless).

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4.
- Related: transport [1-1-transport-and-scpi-core.md](1-1-transport-and-scpi-core.md), identity [1-2-identity-and-routing.md](1-2-identity-and-routing.md).

## Acceptance criteria

- [ ] One or more **mock TCP servers** (package or `packages/server` test helper) listening on configurable **host/port** (default localhost, ephemeral or fixed port documented).
- [ ] Implements: `*IDN?` with **configurable** manufacturer/model strings; `SYST:ERR?` or empty error queue; newline-delimited commands.
- [ ] At least **three** personalities: **oscilloscope-like**, **PSU-like**, **DMM-like** (minimal read/query stubs), plus an **unknown** `*IDN?` for raw-SCPI sessions — exact strings aligned with registry tests.
- [ ] Sufficient SCPI for **smoke tests**: connect via existing REST **connect** route, list session, issue at least one **typed** query per kind where routes exist, **disconnect** cleanly.
- [ ] **pnpm** script or documented one-liner to **start mock + run tests** (CI-friendly).
- [ ] README snippet: how to point the UI at the mock (host/port).

## Notes

- Fidelity to real instruments is **not** required — only **protocol-shaped** behavior for routing and UI.
- Optional: share one process with **multiple ports** or **one port** with multiple IDN profiles via config reload — keep v1 simple.
