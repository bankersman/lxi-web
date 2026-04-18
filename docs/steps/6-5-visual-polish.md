# 6.5 — Visual polish (bounded)

## Goal

Make the dashboard feel a touch more intentional without breaking the
**utility-first bench** voice established in the factsheet: clearer
hierarchy on live numbers, faster scan of device cards, and less
default-Tailwind gray. Tack on two **quiet** header links — one to the
user manual (GitHub Pages), one to the source repo — so help and
"about" are reachable in one click without becoming chrome noise.

This sub-step is explicitly narrow: token tweaks, per-`DeviceKind`
accent borders, typography utilities, empty/loading states, and the
two header links. **No** illustration stack, **no** new dependency,
**no** photos, **no** redesign. Epic 6 non-goals forbid a visual
redesign in the general case; 6.5 is the documented exception, with
the bounds codified below.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 6 (UX pass), sub-step 6.5.
- Related:
  - [2-3-vue-dashboard-shell.md](2-3-vue-dashboard-shell.md) — current
    header + theme token surface.
  - [6-2-detail-page-ia-audit.md](6-2-detail-page-ia-audit.md) — hero
    hierarchy changes overlap with typography tokens here.
  - [3-5-user-documentation-and-landing.md](3-5-user-documentation-and-landing.md)
    — VitePress site + `DOCS_REPO_SLUG` convention that the header
    manual link reuses.

## Scope

### Theme tokens (CSS)

- Extend the `@theme` block in
  [`packages/web/src/assets/main.css`](../../packages/web/src/assets/main.css)
  with per-`DeviceKind` accent tokens (e.g. `--color-kind-scope`,
  `--color-kind-psu`, …). State colors (connected / connecting /
  error / idle) are **not** touched — they already communicate
  meaning.
- Accent tokens are **low saturation** and must remain
  distinguishable in both light and dark modes. Document the palette
  rationale as a comment in `main.css`.
- Optional very subtle gradient on the `AppHeader` background only;
  content areas stay flat.

### Per-kind accent on cards

- Dashboard device cards and the detail-page overview card pick up a
  thin left border (or icon halo) driven by the kind accent token.
  Accent is **category** marking, not status — status still uses the
  existing `state-*` dot.
- `DeviceKindIcon` may pick up the same accent via `currentColor` so
  the halo and the icon agree without extra markup.

### Typography

- Add a small utility (Tailwind layer class or `@utility`) for
  numeric readouts: `font-variant-numeric: tabular-nums` +
  `letter-spacing: -0.01em`.
- Hero readouts (scope V/time labels, PSU V/I, DMM primary, e-load
  V/I/P/R, SG frequency, SA peak) use it. This overlaps with
  [6-2](6-2-detail-page-ia-audit.md); 6.5 owns the utility, 6.2 owns
  which blocks qualify as "hero".
- No font-family change.

### Empty and loading states

- Replace bare strings on "no devices", "no traces", "no history",
  "no transcript" with short copy + a CSS-only shape or skeleton
  (e.g. dashed rounded border, pulse on skeleton rows).
- Skeletons respect `prefers-reduced-motion` — no pulse animation
  when the user has opted out.

### Quiet help strip (header)

Add two destinations to the right cluster of
[`AppHeader.vue`](../../packages/web/src/components/AppHeader.vue),
positioned **before** the theme toggle in focus order:

- **Manual** — opens the GitHub Pages URL for the VitePress site
  (user docs). Default: `https://bankersman.github.io/lxi-web/`.
- **GitHub** — opens the repo root (source + issues). Default:
  `https://github.com/bankersman/lxi-web`.

Styling + behaviour:

- Muted type: `text-fg-muted` + `text-xs`, no background, no badge.
  Underline appears on hover **and** focus-visible only.
- Optional Lucide icon at icon size (`BookOpen` for Manual,
  `Github` — or plain `ExternalLink` — for source). If used, the icon
  sits inline with the word, not instead of it.
- `target="_blank"` + `rel="noopener noreferrer"`. Accessible name
  makes the destination obvious ("Open manual", "Open repository").
- No banner, no modal, no toast. The control is part of the header
  cluster and scales with existing spacing.

URL wiring:

- Two build-time constants: `VITE_LXI_MANUAL_URL` and
  `VITE_LXI_REPO_URL`.
- Read via `import.meta.env` in a small `packages/web/src/config.ts`
  (or equivalent) with the defaults above.
- Document both in `packages/web/.env.example` so forks override with
  one line each. Keep names consistent with the existing
  `DOCS_REPO_SLUG` convention used by
  [`docs/site/.vitepress/config.ts`](../../docs/site/.vitepress/config.ts).

## Acceptance criteria

- [ ] `@theme` in [`main.css`](../../packages/web/src/assets/main.css)
      grows per-`DeviceKind` accent tokens; light and dark variants
      both defined; state colors untouched.
- [ ] Device cards and the overview card show a per-kind accent that
      is category-only (never encodes status).
- [ ] A single numeric-readout utility is applied to hero readouts on
      every detail page. No hard-coded `font-variant-numeric` in
      components.
- [ ] Empty and loading states for dashboard, traces, history, and
      transcript use the new skeleton/empty style and respect
      `prefers-reduced-motion`.
- [ ] `AppHeader` renders a **Manual** link and a **GitHub** link,
      both muted, both keyboard-focusable before the theme toggle,
      both open in a new tab with `rel="noopener noreferrer"`.
- [ ] Manual and GitHub URLs come from `import.meta.env`, with
      defaults pointing at upstream and `.env.example` documenting
      both variables.
- [ ] A11y: axe-core clean on dashboard + at least one detail page;
      no information conveyed by color alone; focus rings are as
      strong as before or stronger; external links have an
      accessible name that identifies the destination.
- [ ] Lucide remains the primary non-text visual for device kind;
      the header links either use text only or text + small inline
      icon.
- [ ] No new runtime dependencies beyond what `packages/web` already
      ships.

## Non-goals

- No illustration library, no animation framework, no mascots, no
  device photos or product shots.
- No changes to state colors or status semantics — that is load-
  bearing and lives with [2-3](2-3-vue-dashboard-shell.md).
- No redesign of the dashboard grid, card shape, or detail-page
  layout; 6.5 only adjusts tokens + typography + header links.
- No translated copy in the new empty-state strings — they go
  through [6.4](6-4-i18n-and-locale-formatting.md)'s i18n surface
  like every other user-visible string, once that ships.
- No VitePress / `docs/user/` visual changes.

## Notes

- The "quiet" requirement is the whole point of the header links.
  Anything that adds visual weight (button background, large icons,
  full-width banner, GitHub logo mark) defeats the purpose. When in
  doubt, lean **quieter**.
- Fork-friendliness matters: the default URLs are correct for the
  upstream repo; every fork should be able to point at its own
  manual + repo with two `.env` lines and no code change.
- If 6.5 reveals that the current `surface` / `fg` scale is too flat
  for the hierarchy 6.2 wants, log that as a follow-up rather than
  broadening 6.5's scope.
