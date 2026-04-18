# 3.5 — User documentation and landing page

## Goal

Make the project **immediately understandable** to a visitor who has never
touched the code, and **runnable** by a solo engineer within minutes. Produce
a clear README, a structured user manual, and a public landing page that
advertises what the app actually does — without drifting into marketing
copy.

Covered in this step:

1. **README.md** — a proper front door: what the app is, who it's for, a
   screenshot or two, a 30-second quick-start (Docker path + from-source
   path, both linked to 3.6), the supported hardware matrix, a "tested on
   other gear?" call-to-action, and links to the manual + Pages site.
2. **User manual** — authored as plain Markdown under `docs/user/` so it
   is readable on GitHub directly and serves as the single source of truth
   for the Pages site.
3. **Landing page (GitHub Pages)** — a **VitePress** site that reuses the
   same Markdown as the manual, adds a short feature-tour landing page,
   and deploys automatically on every push to `main`.
4. **Hardware feedback loop** — a structured GitHub **issue template** so
   users with *other* LXI instruments can share `*IDN?` strings and
   working/failing SCPI notes, and a **"Report your hardware"** section on
   both the README and the landing page that links to it.
5. **LICENSE** — **MIT** (from the Epic 3 planning round).

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3 (usability and platform).
- Related:
  - [3.6 — Docker image and release](3-6-docker-image-and-release.md) — the
    README's "Getting started with Docker" section points here.
  - [3.7 — Optional `@lxi-web/core` npm publishing](3-7-npm-publish-core.md) —
    linked from the manual's "Embed the core in your own tooling" page.
  - [1.2 identity and routing](1-2-identity-and-routing.md) — the hardware
    report template mirrors how `*IDN?` is parsed in the registry.

## Scope

### README.md — rewrite

The current `README.md` is a one-page overview. Grow it to a proper front
door without becoming a manual:

- **Hero paragraph** — what the app is and what it is *not* (not
  multi-user, not a vendor replacement, trusted-LAN only).
- **At a glance** — a short bullet list of the concrete capabilities that
  ship today (card grid, typed scope / PSU / DMM panels with advanced
  capabilities from 2.5 / 2.6 / 2.7, raw SCPI fallback, Rigol drivers).
- **Screenshots** — committed under `docs/assets/screenshots/` and
  referenced via relative paths so they render on both GitHub and the
  Pages site; include at minimum: dashboard grid (light + dark), scope
  detail with waveform, PSU detail with OVP panel, DMM trend logger.
- **Quick start** — two side-by-side sections:
  - **Docker (recommended)**: `docker run --rm -p 8787:8787 ghcr.io/<owner>/lxi-web:latest`
    with `HOST=0.0.0.0` note; linked to [3.6](3-6-docker-image-and-release.md).
  - **From source**: `pnpm install && pnpm dev` as today, with the `HOST` /
    `PORT` env block unchanged.
- **Supported hardware** — table with vendor, model, device kind, status
  (verified / untested / pattern-only); link out to the hardware report
  issue template.
- **Architecture at a glance** — reuse the existing Mermaid diagram from
  PLAN.md Epic 1 so the README shows layers without a full rewrite.
- **Contributing / feedback** — "Got other LXI gear?" call-to-action,
  linked to the issue template; "Found a bug?" default bug template;
  "Roadmap" → link to `progress.md`.
- **License** — MIT, linked to `LICENSE`.

### User manual — `docs/user/`

Authored as plain Markdown so both GitHub and the VitePress site render
from the same files. Target layout:

- `docs/user/index.md` — one-screen overview, who it is for, what it
  cannot do.
- `docs/user/installation.md` — Docker quick-start, from-source build,
  reverse-proxy notes, LAN binding and trusted-network caveats.
- `docs/user/getting-started.md` — first-connect walk-through with
  screenshots, `*IDN?` explanation, raw SCPI fallback.
- `docs/user/oscilloscope.md` — everything exposed on the scope detail
  page: channels, timebase, trigger matrix, acquisition, measurements,
  cursors, math + FFT, references, history, screenshots, presets,
  decoders (one section per 2.7 sub-step, re-using the screenshots).
- `docs/user/power-supply.md` — output control, coupling, OVP/OCP,
  tracking, presets (mirrors 2.5).
- `docs/user/multimeter.md` — modes, ranging + NPLC + auto-zero,
  triggering, math, dual display, trend logger + CSV export,
  temperature, presets (mirrors 2.6).
- `docs/user/raw-scpi.md` — how the unknown-device fallback works and
  the safety defaults (confirm on `*RST`, no implicit system writes).
- `docs/user/troubleshooting.md` — "connection refused", firewall
  rules, mDNS-on-different-subnet caveats (forward-links to 3.1 once
  discovery lands), `HOST=0.0.0.0` and reverse-proxy gotchas.
- `docs/user/hardware-reports.md` — how to fill in the issue template,
  how `*IDN?` pattern-matching works, and how a successful report can
  become a new driver.
- `docs/user/roadmap.md` — autogenerated-looking (but hand-maintained)
  mirror of `progress.md`'s backlog section, aimed at users rather than
  the implementation checklist.

Accessibility / a11y carries the same rules as the app: image alt text
is mandatory on every screenshot; code blocks have language hints so
VitePress syntax-highlights correctly.

### Landing page — VitePress site under `docs/site/`

- **Why VitePress**: Vue-native (reuses the team's existing toolchain),
  first-class Markdown + Vue components, built-in search, publishes static
  HTML suitable for GitHub Pages, zero runtime on the Pages host.
- **Layout**:
  - `docs/site/index.md` — landing: tagline, 4–6 feature cards (card grid,
    typed panels, raw SCPI, capability-gated advanced features, Docker
    one-liner), "Install" CTA, "Report your hardware" CTA, screenshot
    carousel.
  - `docs/site/manual/` — **symlinks or re-exports** of `docs/user/*.md`
    so we do not duplicate content. Implementation note: VitePress
    `srcDir` + `rewrites` can point at `../user/` so edits land in one
    place; alternatively a small pre-build step copies `docs/user/**`
    into `docs/site/manual/`. Either is fine — pick the simpler one at
    implementation time.
  - `docs/site/roadmap.md` — narrative version of the PLAN + progress
    backlog; links back into GitHub for the living checklist.
- **Theme**: stock VitePress default theme with a minimal
  `theme-tokens.css` layer that borrows the **semantic colors** from the
  app's Tailwind theme so the landing feels like the app, not a generic
  docs site.
- **Search**: built-in VitePress local search (no Algolia, no tracking).
- **Base path**: wired dynamically from `${{ github.repository }}` in the
  deploy workflow (see 3.6 for the shared env-extraction step), so the
  site works whether the repo is `<owner>/lxi-web` or renamed later.

### GitHub Pages deployment

Separate workflow from the release pipeline so docs can iterate without a
Docker build. Implementation lives here rather than in 3.6:

- **Workflow**: `.github/workflows/pages.yml`.
- **Triggers**: push to `main` that touches `docs/**`, `README.md`,
  `.github/workflows/pages.yml`, or manual `workflow_dispatch`.
- **Permissions**: `contents: read`, `pages: write`, `id-token: write`.
- **Steps**: setup Node 24, `pnpm install`, derive base path from
  `${{ github.event.repository.name }}`, `pnpm --filter @lxi-web/docs build`
  (VitePress `build`), upload the generated `docs/site/.vitepress/dist/`,
  then `actions/deploy-pages@v4`.
- **Concurrency**: `group: pages`, `cancel-in-progress: false` so
  overlapping pushes queue instead of racing.
- **Secrets required**: **none** (GitHub Pages uses the auto-provided
  `GITHUB_TOKEN`).

### Hardware feedback — GitHub issue templates

Put under `.github/ISSUE_TEMPLATE/` with YAML front matter:

- **`instrument-report.yml`** — structured form:
  - `*IDN?` response (multi-line, required)
  - vendor / model (text, required)
  - device kind (scope / PSU / DMM / other)
  - firmware version (text, optional)
  - what worked (textarea)
  - what failed (textarea)
  - SCPI snippets that surprised you (textarea)
  - dashboard version (`docker image digest` or git SHA)
- **`bug.yml`** — standard reproduction form: steps, expected,
  actual, logs.
- **`feature.yml`** — motivation + proposed UX + impact on existing
  capability layout.
- **`config.yml`** — pins the instrument-report template as
  preferred and turns off the blank issue path.

The landing page's "Report your hardware" button deep-links to
`issues/new/choose` so users land in the right form.

### LICENSE

- **MIT**, committed as `LICENSE` at the repo root. Year: the current
  year at implementation time; copyright holder taken from
  `git config user.name` of the committer (verified during the step,
  not hard-coded here).
- README references the license with a relative link; `package.json`
  files across the monorepo add `"license": "MIT"` so npm metadata
  (3.7) stays consistent.

## Acceptance criteria

- [ ] `README.md` rewritten with: hero, at-a-glance bullets, screenshots,
      two-path quick start (Docker + pnpm), supported-hardware table,
      architecture diagram, contributing + hardware-report CTA, license.
- [ ] All README screenshots committed under `docs/assets/screenshots/`
      and render both on GitHub and the Pages site.
- [ ] User manual present under `docs/user/` with the file set listed
      in **Scope** above; every page has a title, table of contents (if
      > 3 sections), and image alt text.
- [ ] VitePress site under `docs/site/` builds locally via
      `pnpm --filter @lxi-web/docs build` with **no** console warnings
      about missing pages or dead links.
- [ ] VitePress site ingests `docs/user/*.md` via re-export or symlink;
      editing a user manual page shows up on the site without edits to
      two files.
- [ ] `.github/workflows/pages.yml` deploys the Pages site on push to
      `main` (paths filter), succeeds on a first run against this repo,
      and produces a reachable `https://<owner>.github.io/<repo>/`.
- [ ] Issue templates (`instrument-report.yml`, `bug.yml`,
      `feature.yml`, `config.yml`) live under `.github/ISSUE_TEMPLATE/`
      and the "New issue" page shows them in the expected order.
- [ ] `LICENSE` file at repo root (MIT) + `"license": "MIT"` added to
      every `packages/*/package.json`.
- [ ] Accessibility: every committed screenshot has descriptive `alt`
      text; landing page passes a manual keyboard walk-through (tab
      order, visible focus).
- [ ] No broken relative links: CI job (or a local
      `pnpm --filter @lxi-web/docs check-links`) reports zero dead
      links across README, `docs/user/`, and the VitePress site.

## Notes

- **Single-source content**: the split between `docs/user/` (canonical
  Markdown) and `docs/site/` (VitePress scaffolding) keeps the GitHub
  view and the Pages site identical. If a future reviewer wants to
  collapse them, VitePress's `srcDir` already handles it — the split is
  a trade-off, not a constraint.
- **Screenshots**: take them against the **local dev build** with
  deterministic dummy SCPI data (the mock from Epic 4.1 when it exists;
  until then, record against real gear with sensitive strings — serial
  numbers, MAC addresses — blurred manually).
- **Docs package**: the VitePress site is **not** part of the runtime
  build. It lives in its own `packages/docs` (or `docs/site/` with a
  local `package.json`) so `pnpm build` at the repo root keeps shipping
  only `@lxi-web/core|server|web`. CI for Pages installs with the same
  frozen lockfile but only filters the docs workspace.
- **Translation / i18n** is explicitly out of scope; English-only in v1
  per PLAN.md's product voice.
- **No tracking**: no Google Analytics, Plausible, or similar on the
  Pages site. If a reader count ever matters, revisit in a follow-up
  substep.
- **Deprecations** from follow-ups (e.g. if we rename Docker images or
  change env vars later) should update `docs/user/installation.md`
  **and** `docs/site/index.md` — add a checklist line to the release
  PR template (created alongside 3.6) to nudge that.
