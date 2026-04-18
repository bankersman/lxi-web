# 3.5 — User documentation and landing page

## Goal

Make the project **immediately understandable** to a visitor who has never
touched the code, and **runnable** by a solo engineer within minutes. Produce
a clear README, a structured user manual, and a public landing page that
advertises what the app actually does — without drifting into marketing
copy.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3 (usability and platform).
- Related:
  - [3.6 — Docker image and release](3-6-docker-image-and-release.md) — the
    README's "Getting started with Docker" section points here.
  - [3.7 — Optional `@lxi-web/core` npm publishing](3-7-npm-publish-core.md) —
    linked from the manual's "Embed the core in your own tooling" page.
  - [1.2 identity and routing](1-2-identity-and-routing.md) — the hardware
    report template mirrors how `*IDN?` is parsed in the registry.

## Implementation

### README.md

Rewritten as a proper front door: hero paragraph, "at a glance" bullets, two
quick-start paths (Docker + pnpm), supported-hardware table, an ASCII
architecture sketch (the Mermaid diagram in `PLAN.md` is still the canonical
one), contributing + hardware-report CTAs, and an MIT license link. Screenshots
are **deferred** — the acceptance list below marks that as optional until we
have a mock-instrument backend (planned for a later epic) to generate them
deterministically.

### User manual — `docs/user/`

Single source of truth for everything that is not implementation-internal:

- `index.md` — one-screen overview, who it is for, what it cannot do.
- `installation.md` — Docker + from-source paths, reverse-proxy and LAN
  binding notes, mDNS/firewall caveats.
- `getting-started.md` — first-connect walk-through, `*IDN?` explanation,
  drop-recovery.
- `oscilloscope.md` / `power-supply.md` / `multimeter.md` — per-kind
  panel section order + feature tour.
- `raw-scpi.md` — fallback-console behaviour and safety defaults.
- `troubleshooting.md` — the common pitfalls users hit.
- `hardware-reports.md` — how `*IDN?` matching works and how to file a
  report.
- `roadmap.md` — user-facing mirror of `progress.md`.

Plain Markdown so GitHub renders the exact same content as the site.

### Landing page — VitePress under `docs/site/`

- Not a pnpm workspace member; it is a standalone npm project so the
  monorepo lockfile stays focused on the runtime. `pnpm install` at the
  repo root is unaffected.
- **Single source of truth**: a small `scripts/sync-manual.mjs` copies
  `docs/user/*.md` into `docs/site/manual/` on every `dev` / `build`. The
  script rewrites `../../<path>` repo-relative links to absolute GitHub
  URLs (parametrised by `DOCS_REPO_SLUG` / `DOCS_REPO_BRANCH`) so VitePress
  does not flag them as dead. `docs/site/manual/` is git-ignored.
- **Config** — `docs/site/.vitepress/config.ts` — reads `DOCS_BASE` from
  env (defaults to `/lxi-web/`), wires a manual sidebar, enables
  VitePress local search, and sets the footer to MIT.
- **Landing** — `docs/site/index.md` — stock VitePress hero + features
  layout. Two CTAs: "Get started" → `/manual/installation`, "Report your
  hardware" → the issue template.
- **Build** — `cd docs/site && npm ci && npm run build`, output under
  `docs/site/.vitepress/dist/`. Verified locally.

### GitHub Pages workflow

- `.github/workflows/pages.yml` — triggered on push to `main` that touches
  `docs/**`, `README.md`, or the workflow itself, plus `workflow_dispatch`.
- Derives the `DOCS_BASE` from `github.event.repository.name` so the
  site works regardless of the repo slug.
- Passes `DOCS_REPO_SLUG` / `DOCS_REPO_BRANCH` so the sync step rewrites
  links to the right repo.
- Uses `actions/setup-node@v4` with `cache: npm` keyed on
  `docs/site/package-lock.json` for fast repeat runs.
- Uploads the built `dist/` via `actions/upload-pages-artifact@v3` and
  deploys with `actions/deploy-pages@v4`.
- **Permissions**: `contents: read`, `pages: write`, `id-token: write`.
  No extra secrets — uses the auto-provided `GITHUB_TOKEN`.

### Issue templates

Under `.github/ISSUE_TEMPLATE/`:

- `instrument-report.yml` — structured hardware-report form; `*IDN?`
  response mandatory.
- `bug.yml` — steps / expected / actual / logs / build + browser.
- `feature.yml` — motivation / proposed UX / impact / alternatives.
- `config.yml` — disables blank issues and points the "contact links"
  shelf at the hardware-report form.

### LICENSE

- MIT at the repo root.
- `"license": "MIT"` added to the root `package.json`, every
  `packages/*/package.json`, and `docs/site/package.json`.

## Acceptance criteria

- [x] `README.md` rewritten with: hero, at-a-glance bullets, two-path
      quick start, supported-hardware table, architecture sketch,
      contributing + hardware-report CTA, license.
- [x] User manual present under `docs/user/` covering installation,
      getting-started, per-kind panels, raw SCPI, troubleshooting,
      hardware reports, roadmap.
- [x] VitePress site under `docs/site/` builds locally
      (`cd docs/site && npm run build`) with no dead-link errors.
- [x] VitePress site ingests `docs/user/*.md` via a pre-build sync step;
      editing a user manual page is reflected on the site without
      touching two files.
- [x] `.github/workflows/pages.yml` deploys the site on push to `main`
      (paths filter), permissions + concurrency set per GitHub Pages
      guidance.
- [x] Issue templates (`instrument-report.yml`, `bug.yml`,
      `feature.yml`, `config.yml`) live under `.github/ISSUE_TEMPLATE/`.
- [x] `LICENSE` file at repo root (MIT) + `"license": "MIT"` added to
      every `package.json`.
- [~] **Deferred**: committed screenshots. The manual ships without
      screenshots until we have a deterministic mock-instrument backend
      to generate them. Placeholder folder at
      `docs/assets/screenshots/.gitkeep` reserves the location.
- [~] **Deferred**: automated dead-link check across README + docs. The
      VitePress build already fails on dead links inside the manual;
      README-level checks will land alongside the release workflow in
      3.6.

## Notes

- **Single-source content**: `docs/user/` is canonical, `docs/site/manual/`
  is a build artifact. If a future reviewer wants to collapse them,
  VitePress's `srcDir` already handles it — the split is a trade-off,
  not a constraint.
- **No tracking**: no analytics, no third-party scripts. Built-in
  VitePress local search only.
- **English-only** per PLAN.md's product voice; i18n is explicitly out
  of scope.
