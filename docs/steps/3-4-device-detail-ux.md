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

- [x] **Per-kind section order** documented (see below).
- [x] Overview / summary region at the top reflects that order — implemented as
      `DeviceOverviewCard.vue` always rendered first, with the kind-specific
      panel below.
- [x] **Quick actions** — the overview card exposes **Copy `*IDN?`**, **Raw
      SCPI** jump, **Auto-connect** toggle, **Reconnect** (visible on error),
      and **Disconnect**. The last server error is echoed in a dedicated alert
      strip under the header (from `session.error.message`, which already
      propagates through the WebSocket feed).
- [x] No new long-poll storm: the overview card is entirely reactive off the
      existing `SessionSummary` feed + the saved-connections store.
- [x] **Accessibility**: the overview card is the first landmark inside
      `<main>`; headings remain in order; action buttons have discrete
      `aria-label` / `aria-pressed` and a visible focus ring. The error
      message uses `role="alert"`.
- [x] Does not duplicate controls that live inside kind-specific panels; only
      surfaces cross-kind session-level actions, so future tab refactors
      (2.6 / 2.7) only touch the panel layer.

## Per-kind section order

The device page always renders in this order:

1. **Back-to-dashboard** breadcrumb.
2. **Overview card** (`DeviceOverviewCard.vue`):
   - Kind icon + friendly name (`shortIdentity`) + host:port.
   - Status indicator + inline **Reconnect** button (only when errored).
   - Error alert (`session.error.message`, if any).
   - Identity grid: **Vendor / Model / Serial / Firmware**.
   - Action row: **Copy `*IDN?`**, **Raw SCPI**, **Auto-connect** toggle,
     **Disconnect** (pushed to the right).
3. **Kind-specific panel** (unchanged from Epic 2):
   - **Oscilloscope** — hero waveform + channels, then acquisition / trigger,
     then references / measurements / math, then display / cursors, then
     capture / history.
   - **Power supply** — per-channel output + measured V/I rails at the top,
     then pairing / tracking, then presets, then protection (OVP/OCP/OTP).
   - **Multimeter** — current reading + mode / range at the top, then
     dual / math / ranging, then trigger, then logging, then temperature
     transducer settings.
   - **Unknown kind** — raw SCPI console rendered directly, no collapsible.
4. **Raw SCPI** collapsible (`<details id="raw-scpi">`), available for every
   known-kind panel. The overview card's **Raw SCPI** button opens it,
   scrolls to it, and focuses the input. This matches the documented section
   order while keeping the panel itself uncluttered.

## Notes

- Treat this as an **information architecture** pass; pixel-perfect redesign is
  not required.
- The overview card is the single place where the UI talks about the *session*
  as a whole. Panels remain responsible for the *instrument* shape.
- **Auto-connect badge behaviour**: if the instrument is not yet in the saved
  list, pressing the toggle both saves it and flips `autoConnect` to `true`.
  The saved-connections list on the dashboard remains the authoritative place
  to rename / forget entries.
