# 3.4 — Device detail UX

## Goal

Improve **`/device/:sessionId`**: put the **most important** information and
actions **first** for each device kind, and strengthen **overview** summary
cards so the page is scannable in a few seconds. Stay within **small** UI scope;
avoid large new backend features unless they reuse existing polls/streams.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3, UI quality (Epic 2 factsheet).
- Related: detail layouts [2-4-per-session-detail-views.md](2-4-per-session-detail-views.md), PSU panels [2-5-psu-advanced-features.md](2-5-psu-advanced-features.md).

## Acceptance criteria

- [ ] **Per-kind section order** documented in this file (e.g. scope: hero waveform + capture/trigger strip; PSU: output + measured rails + protection; DMM: primary reading + mode + range; unknown: raw SCPI prominent).
- [ ] Overview / summary region at the top reflects that order (hero metrics before secondary tuning).
- [ ] **Quick actions** where reasonable: copy **`*IDN?`** text, **Disconnect**, link to **raw SCPI**; show **last error** if the stack already exposes it.
- [ ] Optional: one or two **compact** extras (e.g. sparkline) **only** if data already exists in the client — no new long-poll storm without a separate step.
- [ ] **Accessibility:** headings remain logical; frequent readouts use `aria-live` as already established; focus order matches visual priority after reordering.
- [ ] Coordinate with **2.6 / 2.7** tabs when those land: this step should not make tab merges painful (prefer moving **sections**, not duplicating controls).

## Notes

- Treat this as an **information architecture** pass; pixel-perfect redesign is not required.
