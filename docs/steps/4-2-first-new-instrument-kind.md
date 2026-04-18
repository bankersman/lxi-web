# 4.2 — First new instrument kind

## Goal

Add **one** new **device category** beyond scope / PSU / DMM: a typed **`I…`**
facade, **`DeviceKind`** (or equivalent) value, **registry** routing from
`*IDN?`, **REST + WebSocket** exposure consistent with existing kinds, and
**dashboard card + `/device/:sessionId`** UI. Ship with **one** driver
implementation **or** a **mock-backed** stub documented for hardware bring-up.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4, Version 2 backlog (examples).
- Related: façades [1-3-typed-facades.md](1-3-typed-facades.md), Rigol pack [1-4-vendor-packs-rigol.md](1-4-vendor-packs-rigol.md), shell [2-3-vue-dashboard-shell.md](2-3-vue-dashboard-shell.md).

## Acceptance criteria

- [ ] **Chosen category** named in this file (e.g. `ISignalGenerator` + AWG/FG — or `IElectronicLoad` — pick one and commit the scope).
- [ ] New facade interface in `@lxi-web/core` with **narrow** methods (same philosophy as 1.3); optional **capability** objects for vendor-specific extras.
- [ ] Registry maps at least one **`*IDN?` pattern** to the new facade (real driver and/or **4.1** mock string).
- [ ] Server: connect path returns correct **kind**; typed routes namespaced (e.g. `/api/sessions/:id/sg/...` or chosen prefix) — follow existing patterns.
- [ ] Web: kind **icon** + card mini-panel + detail page with **labeled** controls and `aria-live` for live readings.
- [ ] **Unknown** devices unchanged; raw SCPI still works for unrelated models.
- [ ] Tests or manual checklist documented: connect mock, exercise primary workflows, disconnect.

## Notes

- **Second and third** categories remain backlog — this step proves the **pipeline** once.
- If hardware is unavailable, **4.1** mock must advertise a matching `*IDN?` for CI.
