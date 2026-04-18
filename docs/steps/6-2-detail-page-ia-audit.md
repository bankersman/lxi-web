# 6.2 — Detail-page information architecture audit

## Goal

Retrospective on **how each detail page actually reads**, against the
3.4 intent of putting the hero and safety-critical readouts first. The
motivating case: on the PSU detail page the per-channel output rails —
the single most-used block on a PSU — currently render as the fifth
block, behind pairing / tracking / presets / protection. Similar
hierarchy problems exist on other pages; several blocks feel like "form
for every SCPI field" rather than "what an operator needs first".

Audit every kind, rank blocks by frequency-of-use vs risk, reorder,
collapse-by-default where appropriate, densify where blocks read like
raw API forms, and update the 3.4 documented section order to match
whatever actually ships. No backend changes — this is purely a Vue
layout + CSS pass per kind.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 6 (UX pass).
- Related:
  - [3-4-device-detail-ux.md](3-4-device-detail-ux.md) — original section-order intent; gets updated in this step.
  - [2-5-psu-advanced-features.md](2-5-psu-advanced-features.md), [2-6a-dmm-range-and-triggering.md](2-6a-dmm-range-and-triggering.md), [2-6b-dmm-math-and-dual-display.md](2-6b-dmm-math-and-dual-display.md), [2-6c-dmm-logging-and-temperature.md](2-6c-dmm-logging-and-temperature.md), [2-7a-scope-capture-control.md](2-7a-scope-capture-control.md), [2-7b-scope-analysis.md](2-7b-scope-analysis.md), [2-7c-scope-save-and-replay.md](2-7c-scope-save-and-replay.md) — per-block authoring refs.
  - [4-3-electronic-load.md](4-3-electronic-load.md), [4-4-signal-generator.md](4-4-signal-generator.md), [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md) — kind-specific detail pages added in Epic 4.

## Scope

### Audit method

For every device kind (oscilloscope, PSU, DMM, e-load, signal
generator, spectrum analyzer), walk the current detail-page layout
block-by-block and score each block on two axes:

- **Touch frequency** — how often does the operator actually interact
  with or look at this block during a typical bench session?
  (Always / Sometimes / Rarely / Setup-only).
- **Density** — does the block read as scannable operator UI, or as a
  raw form with one input per SCPI field, generic units, placeholder
  text that looks unfinished?

For each kind, produce a short ranked block list and a before / after
screenshot pair. Drop in per-kind section of this step doc. Use the
scores to drive three concrete edits per page:

1. **Reorder** — hero readouts and most-touched interactive block move
   to the top. Safety-critical readouts (PSU trips, e-load protection
   state) surface in the hero row, not collapsed.
2. **Collapse** — setup-only blocks (scope display persistence,
   protection limits, preset banks) collapse by default on first
   visit; remember state per browser.
3. **Densify** — raw-form blocks (protection grids, preset lists, DMM
   temperature config) rewrite into scannable tables or chip bars with
   real unit labels, trip badges, and state colour (never colour-only).

### Expected outcomes per kind

The exact final order is decided during the audit; this is the current
best-guess ordering that the audit should either confirm or replace.

- **Oscilloscope:** hero `uPlot` + channel strip → trigger + run/stop +
  acquisition-status row → measurements → tabs for
  cursors / math / decoders / references / history / display / presets
  (tabs stay as 2.7 designed; entry point doesn't change).
- **Power supply:** per-channel rail strip (big V / I readout +
  output toggle + trip state) → setpoint form (V / I per channel) →
  tabs for pairing + tracking / protection / presets. Channels move
  from 5th to 1st. Trip state surfaces on the channel rail, not in a
  nested protection panel.
- **Multimeter:** primary reading (hero) + mode pill + range chips →
  trigger row → math + dual display row → tabs for
  logging / temperature / presets. Range and NPLC as chip bars rather
  than drop-downs where feasible.
- **Electronic load:** hero V / I / P / R readout + mode + setpoint +
  input toggle → protection row → tabs for
  dynamic / battery / logger / presets. Trip state on the hero row.
- **Signal generator:** per-channel hero (waveform pill + frequency +
  amplitude + output toggle) → waveform-type-aware form →
  impedance / sync row → tabs for modulation / sweep / burst /
  arbitrary / presets.
- **Spectrum analyzer:** hero trace `uPlot` + peak readout →
  frequency / RBW / ref-level + sweep / single-sweep → markers table
  → tabs for channel-power / trigger / limit-lines / averaging /
  presets.
- **Unknown kind:** unchanged (raw SCPI console fills the page).

### Cross-cutting tweaks

- **Overview card** (3.4): action row moves Disconnect to the far
  right with a hover-red state so it's reachable but not adjacent to
  harmless toggles. Auto-connect toggle and Raw SCPI jump stay on the
  left.
- **Transcript tab** (5.1) sits to the right of Raw SCPI in the tab
  order on every detail page.
- Panel spacing pass: tighten padding on dense tables, loosen spacing
  around hero readouts so the eye lands on the live numbers first.
  Tailwind utility pass only, no scoped CSS unless necessary.
- Colour audit: state colours (output on, trip tripped, measurement
  overrange) meet WCAG AA contrast on both light and dark; every
  state also renders a text / icon signal (2.3 rule).
- Dashboard card mini-controls follow the same hierarchy principle
  on a compact scale — hero reading or state first, mini-toggle
  second, link-to-detail last. Audit the mini panels for the same
  kinds in this step.

## Acceptance criteria

- [ ] Per-kind audit section written into this step doc with before /
      after screenshots (committed under `docs/assets/screenshots/ia/`
      or similar).
- [ ] Oscilloscope detail page preserves the hero-first layout but
      reorders secondary tabs by measured touch frequency.
- [ ] PSU detail page promotes per-channel rails to the first block,
      surfaces trip state in the hero row, and collapses pairing /
      tracking / presets / protection behind tabs by default.
- [ ] DMM detail page promotes the primary reading + mode + range to
      the hero row; range / NPLC render as chip bars where feasible.
- [ ] E-load detail page hero shows V / I / P / R + mode + setpoint +
      input toggle, with trip state on the hero row.
- [ ] Signal generator detail page per-channel hero shows waveform
      pill + frequency + amplitude + output toggle.
- [ ] Spectrum analyzer detail page hero trace sits above the control
      grid; markers table surfaces peak on the first row by default.
- [ ] Overview card action-row rearrangement lands.
- [ ] Transcript tab ordering fixed across every detail page.
- [ ] Dashboard card mini-controls audited and updated to match the
      same hierarchy principle.
- [ ] `docs/steps/3-4-device-detail-ux.md` updated to reflect the new
      documented section order per kind.
- [ ] Accessibility pass: axe-core clean on every detail page; colour
      contrast verified for every state colour on both themes.
- [ ] `prefers-reduced-motion` honoured for any new collapse / expand
      animations.
- [ ] Dark-mode verification on every detail page — a reorder is an
      opportunity to catch contrast regressions.

## Notes

- This step will grow if left open-ended. Keep acceptance criteria
  tight — the step is "reorder, collapse, densify" on existing blocks,
  not a full redesign. New blocks or new capabilities belong in their
  originating epic.
- The "before / after screenshot per kind" requirement is both the
  audit method and the deliverable. If it's impossible to take the
  before screenshot (because the page is already good), the block
  ranking for that kind justifies that in prose.
- Blocks that feel like API sandbox (protection grid, preset list,
  DMM temperature transducer form) are usually signalling that they
  should be a tab rather than a top-level block. Err toward collapsing
  / hiding them — the operator can always expand when they need them.
- No new backend endpoints in this step. If reordering reveals a
  missing backend capability (e.g. "PSU rail would benefit from a
  combined V + I readback but current endpoints force two polls"),
  capture it as a backlog item and move on — don't do it here.
- This step intersects with 5.3 safe mode (write controls render
  disabled in safe mode) and 5.1 transcript tab ordering — coordinate
  the tab positions so they're stable after 5.x lands.
