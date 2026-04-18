# 3.7 — `@lxi-web/core` npm publishing

## Goal

Let people who already run Node at the bench **reuse the typed drivers**
(`ScpiSession`, `IOscilloscope`, `IPowerSupply`, `IMultimeter`, and the
Rigol DHO800 / DP900 / DM858 implementations) **without adopting the
dashboard**. Publishing `@lxi-web/core` to npm on every versioned
release is the lowest-friction path: `npm i @lxi-web/core` and you have
the whole vendor-neutral client surface.

This is **independent** from the Docker release (3.6): Docker does not
install from npm, and a broken publish should not block a Docker image
from shipping. The tag trigger is shared, the jobs are not.

Covered in this step:

1. **`@lxi-web/core` publish readiness** — `package.json` metadata,
   clean `exports` map, type declarations, and a `files` / `publishConfig`
   allowlist so only build output ships.
2. **`@lxi-web/server` + `@lxi-web/web`** stay **private** (these are
   app packages, not libraries, and publishing them invites confusion).
3. **Release workflow** — a parallel job on `.github/workflows/release.yml`
   that runs on the same `v*.*.*` tag, verifies the version, and publishes
   to npm with provenance.
4. **Consumer documentation** — a dedicated `docs/user/embed-core.md`
   page + a short "Use the drivers in your own code" section on the
   Pages landing.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3 (usability and platform).
- Related:
  - [3.6 — Docker image and release](3-6-docker-image-and-release.md)
    — shares the tag trigger, versioning rules, and sanity gate.
  - [3.5 — User documentation and landing page](3-5-user-documentation-and-landing.md)
    — the "embed-core" page ingests into the Pages site.
  - [1.3 typed façades](1-3-typed-facades.md) and
    [1.4 Rigol vendor pack](1-4-vendor-packs-rigol.md) — the surface
    that becomes the public API once published.

## Scope

### `@lxi-web/core` — make it publishable

Audit the package as a library, not a monorepo-internal helper:

- **`package.json`** additions / corrections:
  - `"version"` mirrored with the root (enforced by the release workflow).
  - `"license": "MIT"` matching `LICENSE` (from 3.5).
  - `"description"` — one sentence, matches the README's tagline.
  - `"keywords": ["lxi", "scpi", "instrumentation", "rigol", "oscilloscope", "power-supply", "multimeter"]`.
  - `"repository"`, `"homepage"`, `"bugs"` pointing at
    `https://github.com/<owner>/<repo>` (rendered from
    `${{ github.repository }}` at publish-time, no hard-coded URL).
  - `"engines": { "node": ">=24" }` matching the root.
  - `"type": "module"` — already ESM in the monorepo; confirm.
  - `"exports"` map with both `"import"` and `"types"` fields per entry:
    - `"."` — the root façade exports (`IOscilloscope`, `IPowerSupply`,
      `IMultimeter`, capability interfaces, DTOs).
    - `"./scpi"` — `ScpiSession`, `TcpTransport`, `IScpiPort`, error types.
    - `"./drivers/rigol"` — `RigolDho800`, `RigolDp900`, `RigolDm858` +
      pattern detectors.
    - Explicit subpaths stop consumers from reaching into `dist/…`
      internals that we do not consider stable.
  - `"files": ["dist", "README.md", "LICENSE"]` — nothing else ships.
  - `"publishConfig": { "access": "public", "provenance": true }` so
    `npm publish` under a scoped name defaults to public, and npm
    records the provenance attestation against the GitHub Actions run.
- **Tree-shakability**: no side-effectful imports at the package root
  (audit `src/index.ts`); set `"sideEffects": false` once confirmed.
- **Type declarations**: build output must include `.d.ts` + `.d.ts.map`
  for every entry; add an integration-test-style script
  (`pnpm --filter @lxi-web/core test:exports`) that imports each
  `exports` subpath from a tiny sample file and fails if any path does
  not resolve.
- **README for the package**: a short `packages/core/README.md` with:
  - 10-line "what you get" summary.
  - Install snippet.
  - Minimal usage: connect via `TcpTransport`, `*IDN?` routing to a
    façade, read one measurement.
  - Link back to the main repo README and the user manual's
    "embed-core" page.

### `@lxi-web/server` + `@lxi-web/web`

Explicitly mark them `"private": true` in their `package.json` files so
an accidental `npm publish` from a local shell refuses to continue, and
document **why** in comments:

- `@lxi-web/server` depends on filesystem paths to the built web dist
  and has no stable public API; consumers who want a backend should
  build it themselves from the repo or run the Docker image.
- `@lxi-web/web` is a Vite SPA bundle, not a library; publishing a
  `dist/` to npm makes no sense.

This keeps the "is this library-grade?" question answered by metadata,
not folklore.

### Release workflow — `npm` job on `.github/workflows/release.yml`

Runs in **parallel** with the `docker` job after the shared sanity gate:

- Checkout, pnpm + Node 24 setup, `pnpm install --frozen-lockfile`,
  then `pnpm --filter @lxi-web/core... build` (the `...` pulls in any
  internal deps if they exist later).
- **Version verification** — identical to 3.6: fail the job if
  `packages/core/package.json#version` does not equal the tag's
  `v<version>` suffix, so the Docker and npm artefacts are always
  locked to the same release.
- **Registry auth** — writes an `.npmrc` with
  `//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}` in the
  step's scratch dir (never committed, never logged).
- **Publish** — `pnpm --filter @lxi-web/core publish --access public
  --no-git-checks --provenance`. `--no-git-checks` tolerates the
  detached-HEAD state of a tag checkout; `--provenance` records the
  SLSA provenance statement tied to the GitHub Actions run so npm
  shows the "Built and signed on GitHub Actions" badge next to the
  package.
- **Permissions on the job**:
  - `contents: read`
  - `id-token: write` (required for npm provenance)
- **Dry-run guard**: on pushes to `main` (not tags), the `npm` job can
  optionally run `pnpm --filter @lxi-web/core publish --dry-run` to
  catch packaging regressions before a release. Decide at
  implementation time based on CI minute budget; do **not** add before
  the first tagged release lands cleanly.
- **Pre-release tags** (`v1.2.3-rc.1`) publish to npm under the
  **`next`** dist-tag via `--tag next`, leaving `latest` pinned to
  the last stable release. Stable tags use the default `latest`.

### Consumer documentation

- `docs/user/embed-core.md` (new, ingested into the Pages site per 3.5):
  - **When to use**: short checklist of "you want this if…" vs "you want
    the Docker image if…".
  - **Install**: `npm i @lxi-web/core` (and the equivalent `pnpm` /
    `yarn` one-liners).
  - **Connect and query** — 20 lines of example code using
    `TcpTransport` + `ScpiSession`.
  - **Routing to a typed façade** — `identifyAndBuild(idn, session)`
    walk-through (exact name aligned with Epic 1.2's registry when the
    step is implemented).
  - **Stable surface** — explicit list of the exported subpaths and a
    note that anything under `dist/…` directly is not versioned.
  - **Versioning** — semver promise: breaking changes in the exported
    types or capabilities bump the major; new optional capabilities are
    minor bumps; driver fixes are patches.
  - **Reporting upstream** — link to the hardware-report issue template
    from 3.5 so third-party drivers contributed back through PRs land in
    the registry for everyone.
- Pages landing (from 3.5) gets a short "Drivers without the dashboard?"
  card linking to `embed-core.md`.

## Acceptance criteria

- [ ] `packages/core/package.json` has: `version`, `license: MIT`,
      `description`, `keywords`, `repository`, `homepage`, `bugs`,
      `engines.node >= 24`, `type: module`, an explicit `exports` map
      for `.`, `./scpi`, and `./drivers/rigol`, `files: ["dist",
      "README.md", "LICENSE"]`, `publishConfig.access: public`,
      `publishConfig.provenance: true`, `sideEffects: false` (once
      verified).
- [ ] `packages/server/package.json` and `packages/web/package.json`
      have `"private": true`.
- [ ] `pnpm --filter @lxi-web/core test:exports` (or equivalent) imports
      every declared `exports` subpath from a clean tmp dir and passes.
- [ ] Running `pnpm --filter @lxi-web/core pack` produces a tarball that
      contains **only** `dist/**`, `README.md`, `LICENSE`, and
      `package.json` — no `src/`, no tests, no fixtures.
- [ ] `packages/core/README.md` exists with install + minimal usage +
      link to the main README.
- [ ] `.github/workflows/release.yml` grows an `npm` job that:
  - [ ] Runs in parallel with `docker` after the sanity gate.
  - [ ] Fails fast if `packages/core/package.json#version` does not match
        the pushed tag.
  - [ ] Publishes with `--access public --provenance`; the resulting
        npm package page shows the provenance badge.
  - [ ] Publishes pre-release tags (`-rc.N`, `-beta.N`) under the `next`
        dist-tag and stable releases under `latest`.
- [ ] `docs/user/embed-core.md` exists and is wired into the VitePress
      site's navigation from 3.5.
- [ ] First tagged release **after** this step publishes both the Docker
      image (from 3.6) **and** the npm package cleanly, with matching
      versions.
- [ ] npm package page lists repository, homepage, and bugs URLs and
      the provenance attestation links back to the correct GitHub
      Actions run.

## Secrets required

Add to **Settings → Secrets and variables → Actions → Repository
secrets** before the first tag push, otherwise the `npm` job will fail
the publish step:

- **`NPM_TOKEN`** — an **automation-type** npm access token for the
  `@lxi-web` scope (create at
  `https://www.npmjs.com/settings/<owner>/tokens` with the
  **Automation** preset so 2FA does not block CI). Scope the token to
  the `@lxi-web/core` package only once provenance is working, to
  minimise blast radius.

**Also required (one-time)**:

- The `@lxi-web` npm scope must exist and the token's owner must have
  publish rights on it. If the scope is not yet claimed, create it
  manually (`npm org create @lxi-web` on a maintainer account) **before**
  the first tag push; otherwise npm will reject the publish with a
  403 and the release workflow will fail at the last step only.
- On the **npm package settings** page, enable **"Require two-factor
  authentication and automation tokens"** once the first publish lands,
  so future manual `npm publish` attempts from laptops are blocked
  unless they go through the workflow. This is belt-and-braces with
  the token scoping above.

**No secret needed** for provenance itself — npm uses the GitHub
Actions OIDC token (`id-token: write`) plus `NPM_TOKEN` to link the
two.

## Notes

- **Why publish `core` but not `server` / `web`?** `core` is driver +
  interface code that's genuinely reusable by anyone running Node.
  `server` wraps a single Fastify instance with a specific REST / WS
  contract; consumers who want that surface should embed the source
  directly or run the Docker image. `web` is an app bundle, not a
  library.
- **Scope name**: `@lxi-web` assumed throughout, matching the
  monorepo. If the scope is already taken on npm, rename consistently
  (`@lxi-web-core`, `@lxi-client`, etc.) during implementation — all
  references in this step doc use the current scope.
- **Dual-publish of other packages later** is easy to add as a backlog
  item: drop the `"private": true` flag, add the package to the
  workflow's publish list, and bump its `exports` map. Not planned in
  v1.
- **Deprecation path**: `npm deprecate @lxi-web/core@<version>` is fine
  for unfixable-in-place bugs; prefer a fast patch release over a
  deprecation when possible so downstream consumers see the fix with a
  normal `pnpm up`.
- **Canary / edge releases** are deliberately not wired. If the project
  ever needs them, extend the `npm` job to also publish on
  `workflow_dispatch` with a generated `0.0.0-sha-<short>` version to
  a dedicated dist-tag (`canary`) — follow-up substep, not v1.
