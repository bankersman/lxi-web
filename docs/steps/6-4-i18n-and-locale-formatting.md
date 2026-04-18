# 6.4 — i18n + locale-aware formatting

## Goal

Internationalize the **Vue dashboard** (`packages/web`) so operators can
read **labels, errors, dialogs, and help** in **English, German,
Spanish, or Dutch**, while **numbers, dates, and times** respect either
the **browser's requested locale** (e.g. `de-AT` → Austrian grouping) or
**explicit user preferences** (comma vs dot, 12h vs 24h, short date
order) stored in `localStorage`.

**Out of scope for this step:** translating **`docs/user/`** or the
**VitePress** GitHub Pages site — those stay **English-only** unless a
future epic explicitly budgets translated manuals.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 6 (UX pass).
- Related:
  - [3-5-user-documentation-and-landing.md](3-5-user-documentation-and-landing.md)
    — English manual; unchanged by 6.4.
  - [6-1-keyboard-shortcuts.md](6-1-keyboard-shortcuts.md) — shortcut
    labels and help-overlay copy must use the same i18n pipeline.

## Scope

### UI language (message catalogs)

- **Libraries:** `vue-i18n` (Vue 3) or equivalent with lazy-loaded JSON
  per locale, plural rules, and composable `t()` / `$t` in SFCs.
- **Supported v1 UI languages:** `en`, `de`, `es`, `nl` — one catalog
  per language (region-agnostic copy: `de` covers `de-DE`, `de-AT`, …).
- **Initial resolution:** walk `navigator.languages` in order; pick the
  **first supported** language by **BCP 47 prefix match** (`de-AT` →
  `de`, `en-GB` → `en`). Persist explicit user override in
  `localStorage` when the operator chooses a different language in the
  header/settings.
- **Header control:** language picker shows **native language names**
  and/or ISO codes — **do not** use country flags as language icons.

### Number / date / time formatting (`Intl`)

- **Default format locale:** use the **full** `navigator.language` tag
  (e.g. `de-AT`) for `Intl.NumberFormat`, `Intl.DateTimeFormat`, and
  related APIs so **notation matches the user's OS/browser request**
  while UI strings may use the coarser `de` catalog.
- **User overrides:** a **Regional** (or **Numbers & time**) settings
  surface with **intent-based** controls, not raw locale IDs:
  - **Number presets** — e.g. "Same as browser", European `1.234,56`,
    US-style `1,234.56`, space-separated thousands — each preset maps
    internally to a documented `Intl` locale or option bundle; show a
    **live preview** (`1 234,56 V`).
  - **Time** — **12-hour** vs **24-hour** (`hourCycle` / `hour12`).
  - **Short date** — ordered choices with previews (resolve DD/MM vs
    MM/DD ambiguity explicitly).
- **Persistence:** store overrides in `localStorage` with a schema
  version key (e.g. `lxi-web.locale.v1`).
- **Independence from UI language:** maintain a **`formatOverrideActive`**
  (or equivalent) flag — when the user has **explicitly** set format
  prefs, **changing UI language updates only strings**, not `Intl`
  defaults. Offer **Reset to browser** to clear overrides and re-sync
  formats from `navigator.language`.

### Centralized format helpers

- Replace ad-hoc `toFixed` / string concat for **user-visible** numbers
  with helpers that read the **resolved format locale** and options
  from the locale store (see existing
  [`packages/web/src/lib/format.ts`](../../packages/web/src/lib/format.ts))
  — `formatSi`, `formatTime`, etc. must become locale-aware or delegate
  to `Intl` consistently.

### Non-goals

- **No** translated README / `docs/user/` / VitePress in 6.4.
- **No** CJK or RTL languages in v1 — defer font stack, layout, and QA.
- **No** server-side locale negotiation — the Fastify API stays
  language-agnostic; only the SPA ships catalogs.

## Acceptance criteria

### Coverage — **every user-visible static string**

The following **must** go through the i18n message pipeline (no hard-coded
user-facing English left in production Vue/SFC code paths):

- [ ] **All** `.vue` templates: visible text, `title` / `aria-label` /
      `aria-placeholder` / `placeholder` where they convey UI meaning to
      users or screen readers (not raw SCPI examples — those may stay
      literal where they document wire format).
- [ ] **Pinia stores** — user-visible toast/snackbar copy, validation
      errors surfaced to the UI, default labels.
- [ ] **Router** — document titles / meta titles if shown or used for
      accessibility.
- [ ] **Keyboard shortcut** registry (6.1) — human-readable **labels**
      and help-overlay descriptions.
- [ ] **Error boundaries / catch** — friendly error strings (not stack
      traces; technical detail can stay English in dev-only paths if
      clearly separated).

**Explicit exclusions (do not translate):**

- Verbatim **SCPI** commands, `*IDN?` / `*OPT?` samples, instrument
  **model strings** from the device, **hostnames**, **IPs**, file paths,
  and **console/log** lines meant for paste into GitHub issues.

### Locales and behavior

- [ ] Message catalogs exist for **en, de, es, nl**; **English** is the
      fallback when a key is missing (dev warning).
- [ ] **Pluralization** and **parameterized** strings (`{n}`, `{name}`)
      work for at least one non-English locale in acceptance tests.
- [ ] **Default** UI language follows `navigator.languages` resolution;
      manual override persists across reloads.
- [ ] **Default** number/date/time formatting follows **full browser
      locale tag** until overridden.
- [ ] **Format overrides** persist; when active, **language change** does
      not alter them; **Reset to browser** clears overrides.
- [ ] **`document.documentElement.lang`** reflects the active UI
      language for accessibility.

### Quality

- [ ] No user-visible string regressions in **English** (parity check:
      same UX coverage as pre-6.4).
- [ ] **axe-core** still passes on shell + one detail page per device
      kind with a non-English locale selected.

## Notes

- A **grep-based CI check** (or ESLint plugin) that flags literal
  strings in templates is optional follow-up — not required to close 6.4
  if reviewers instead use a **checklist + spot audit** against this
  file.
- Asian locales and **RTL** are explicitly deferred — when added,
  revisit typography, number shaping, and layout mirroring.
- If **Epic 6.3** (GitHub report URLs) lands before 6.4, issue-template
  query params remain **English field names**; only the **in-app** chrome
  is translated.
