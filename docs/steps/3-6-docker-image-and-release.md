# 3.6 — Docker image and release workflow

## Goal

Make **"install the app"** a one-liner for users who do not want to deal
with Node, pnpm, or workspaces. Ship a single container image that serves
the API **and** the built SPA from the same port, and publish it on
**tagged releases** to both **GitHub Container Registry** (primary) and
**Docker Hub** (mirror).

Covered in this step:

1. **Dockerfile** — multi-stage, builds the monorepo once and produces a
   small runtime image that runs `@lxi-web/server` and serves the
   `@lxi-web/web` dist from the same Fastify instance.
2. **Compose + run recipes** — `docker compose` snippet + `docker run`
   one-liners documented in the README and the user manual.
3. **Release workflow** — GitHub Actions job that fires on
   `git tag v*.*.*`, builds multi-arch images, signs them, and pushes
   to GHCR and Docker Hub in parallel.
4. **GitHub Release** — same workflow attaches the built source tarball
   and an auto-generated changelog derived from commit history since the
   previous tag.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3 (usability and platform).
- Related:
  - [3.5 — User documentation and landing page](3-5-user-documentation-and-landing.md)
    — README and manual quick-start sections link here.
  - [3.7 — `@lxi-web/core` npm publishing](3-7-npm-publish-core.md) — runs
    as a parallel job on the same tag trigger.

## Scope

### Fastify — serve the SPA

Before Docker is useful, `@lxi-web/server` must serve the built
`@lxi-web/web` bundle at `/` in production so one container covers both.
Small server-side additions:

- Register **`@fastify/static`** **only when `NODE_ENV=production`** (dev
  still relies on Vite's dev server proxy to `8787`).
- Serve from a path resolved at runtime via `WEB_DIST` env var, defaulting
  to `../web/dist` relative to the server bundle — works both in the
  monorepo layout and when the image copies web dist alongside the server
  bundle.
- SPA fallback: any non-`/api/*`, non-`/ws/*` route falls back to
  `index.html` so Vue Router deep-links work on refresh.
- **Trusted-network reminder** is served as a `<noscript>` banner and
  logged at boot when `HOST=0.0.0.0` — same caveat as PLAN.md.

### Dockerfile

Multi-stage, **distroless-ish** final image:

1. **`deps`** (`node:24-alpine`)
   - Copy `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and
     every `packages/*/package.json`.
   - `corepack enable && pnpm install --frozen-lockfile`.
2. **`build`**
   - Copy the full source.
   - `pnpm --filter @lxi-web/core... build` then
     `pnpm --filter @lxi-web/server build` and
     `pnpm --filter @lxi-web/web build`.
   - `pnpm deploy --filter @lxi-web/server --prod /deploy/server` to get
     a self-contained `node_modules` without devDeps.
   - Copy `packages/web/dist` into `/deploy/server/web-dist`.
3. **`runtime`** (`gcr.io/distroless/nodejs24-debian12:nonroot` or
   `node:24-alpine` as a fallback if distroless is awkward — decide at
   implementation time, prefer distroless for size + CVE surface)
   - `COPY --from=build /deploy/server /app`.
   - `ENV WEB_DIST=/app/web-dist` and `HOST=0.0.0.0`, `PORT=8787`.
   - `EXPOSE 8787`.
   - `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
     (a `GET /healthz` endpoint must exist on the server; trivial to add
     during this step if it's not there yet).
   - `USER 65532:65532` (nonroot).
   - `CMD ["node", "packages/server/dist/index.js"]`.

The `Dockerfile` lives at the repo root so the build context is the
whole monorepo; a `.dockerignore` trims `node_modules`, `dist`, `.git`,
`packages/web/node_modules/.cache`, `docs/site/.vitepress/cache`, etc.

### `docker compose` — recommended local recipe

Commit `docker-compose.yml` at the repo root for users who prefer
compose over `docker run`:

```yaml
services:
  lxi-web:
    image: ghcr.io/<owner>/lxi-web:latest
    ports: ["8787:8787"]
    environment:
      HOST: 0.0.0.0
    restart: unless-stopped
```

Documented in `docs/user/installation.md` with the trusted-LAN caveat
pulled out into its own admonition.

### Release workflow — `.github/workflows/release.yml`

Triggers on `push` tags matching `v*.*.*`.

**Shared setup**:

- Checkout with `fetch-depth: 0` so the changelog step sees full history.
- `pnpm/action-setup@v4`, Node 24 via `actions/setup-node@v4` with
  `cache: pnpm`.
- `pnpm install --frozen-lockfile`.
- `pnpm -r typecheck && pnpm -r test && pnpm -r build` as a sanity gate
  before any publish — the release refuses to push an image for a tag
  that would fail CI.

**`docker` job** (runs after the sanity gate):

- `docker/setup-qemu-action@v3` + `docker/setup-buildx-action@v3` for
  multi-arch.
- Platforms: `linux/amd64`, `linux/arm64` (so Raspberry Pi 4 / 5 and
  Apple Silicon lab machines work).
- **Login to GHCR**: `docker/login-action@v3` with `registry: ghcr.io`,
  username `${{ github.actor }}`, password `${{ secrets.GITHUB_TOKEN }}`.
- **Login to Docker Hub**: `docker/login-action@v3` with
  `${{ secrets.DOCKERHUB_USERNAME }}` / `${{ secrets.DOCKERHUB_TOKEN }}`.
- **Build + push**: `docker/build-push-action@v6` with `push: true`,
  `provenance: true`, `sbom: true`, and **both** registries in `tags:`.
  Tags from `docker/metadata-action@v5`:
  - `ghcr.io/${{ github.repository }}:latest`
  - `ghcr.io/${{ github.repository }}:${{ github.ref_name }}`
    (e.g. `v1.2.3`)
  - `ghcr.io/${{ github.repository }}:1.2` (major.minor)
  - `ghcr.io/${{ github.repository }}:1` (major)
  - same four tags under `docker.io/<dockerhub_user>/lxi-web:*`.
- **Attest**: `actions/attest-build-provenance@v2` for both pushed
  digests so users can verify the image with `cosign verify-attestation`.
- **Cache**: `cache-from: type=gha, cache-to: type=gha,mode=max` to keep
  subsequent releases fast.

**`github-release` job** (runs after `docker` finishes):

- `softprops/action-gh-release@v2` to create the GitHub Release from the
  tag.
- Auto-generated release notes via `generate_release_notes: true` for a
  baseline changelog from PR titles since the previous tag.
- Optional hand-written `RELEASE_NOTES.md` at the repo root, merged above
  the generated notes when present (lets us write the "highlights" and
  let GitHub list the PRs).

**`npm` job** — lives in 3.7, but runs from the same workflow
(matrix-style) so a tag push produces **every artefact** in one go.

### Versioning

- **Single source of truth** is the root `package.json` `version` field
  (workspace packages already mirror it via pnpm). Publishing is driven
  by git tags, and the workflow asserts `package.json#version ==
  refs/tags/v<version>` before pushing anything; a mismatch fails the
  release fast rather than shipping a confused artefact.
- **`pnpm version <patch|minor|major>`** at the repo root is the
  recommended way to bump — it writes the tag for you and triggers the
  workflow on push.
- **Pre-releases**: tags like `v1.2.3-rc.1` publish to both registries
  with the `:1.2.3-rc.1` tag **but not** `:latest` / `:1.2` / `:1`;
  `docker/metadata-action` handles this automatically with the
  `type=semver` flavour when `prereleases: false` is set for the major /
  minor / latest flavours.

### README + manual integration

- README **Quick start** (from 3.5) gets a Docker block as the primary
  path:
  ```bash
  docker run --rm -p 8787:8787 -e HOST=0.0.0.0 ghcr.io/<owner>/lxi-web:latest
  ```
  and a compose block pointing at the committed `docker-compose.yml`.
- `docs/user/installation.md` grows dedicated sections:
  - **Docker (recommended)** — one-liner + compose + env vars
    (`HOST`, `PORT`, `WEB_DIST`) + reverse-proxy note (only terminate
    TLS on an upstream you trust; the container itself is HTTP-only on
    purpose).
  - **From source** — unchanged pnpm walkthrough.
  - **Verifying the image** — `cosign verify-attestation` snippet.
- Landing page's install CTA points at both the GHCR and Docker Hub
  image pages.

## Acceptance criteria

- [ ] `@lxi-web/server` serves the built `@lxi-web/web` bundle when
      `NODE_ENV=production`, with SPA fallback for non-API, non-WS paths,
      gated behind a `WEB_DIST` env var.
- [ ] `GET /healthz` returns `200` with `{"status":"ok"}` on the server
      (used by the container health check).
- [ ] `Dockerfile` + `.dockerignore` at the repo root; image builds on
      `linux/amd64` and `linux/arm64` locally via
      `docker buildx build --platform=linux/amd64,linux/arm64 .` with no
      warnings about missing files or unused build args.
- [ ] `docker run --rm -p 8787:8787 <built-image>` serves the dashboard
      on `http://127.0.0.1:8787/`; opening a browser reaches the card
      grid and can connect to a real or mocked SCPI peer.
- [ ] `docker-compose.yml` at the repo root matches the README snippet
      and `docker compose up` starts the service end-to-end.
- [ ] `.github/workflows/release.yml` runs on `v*.*.*` tag push and:
  - [ ] Sanity gate (`typecheck` + `test` + `build`) runs first and
        blocks publishes on failure.
  - [ ] Multi-arch image (`amd64` + `arm64`) pushes to both GHCR and
        Docker Hub with the semver tag set listed above.
  - [ ] GitHub Release is created with auto-generated notes.
  - [ ] Build provenance attestation is attached to both pushed digests.
- [ ] `pnpm version <bump>` at the repo root bumps every workspace
      package, writes a matching `v<version>` tag, and the release
      workflow completes green end-to-end against the tag.
- [ ] Workflow fails fast if `package.json#version` does not match the
      pushed tag's `v<version>` suffix.
- [ ] Image size: **runtime layer < 200 MB uncompressed** (distroless
      Node 24 base should land around 120–170 MB including the built
      monorepo — tracked as an informational metric, not a hard gate).
- [ ] `docs/user/installation.md` contains verified Docker + compose
      recipes and the `cosign verify-attestation` snippet; the README
      quick-start references them.

## Secrets required

Add these to **Settings → Secrets and variables → Actions → Repository
secrets** before the first tag push, otherwise the `docker` job will
fail the Docker-Hub login step:

- **`DOCKERHUB_USERNAME`** — Docker Hub account that owns the mirror
  image (e.g. the org or personal handle).
- **`DOCKERHUB_TOKEN`** — access token from Docker Hub with
  **`read,write,delete`** scopes on the `lxi-web` repository; prefer a
  repository-scoped token over an account-wide one.

**No secret needed** for:

- GHCR — uses the auto-provided `GITHUB_TOKEN` with `packages: write`
  permission set on the workflow.
- Build provenance attestation — uses the same `GITHUB_TOKEN` with
  `id-token: write` and `attestations: write`.
- The GitHub Release step — uses the same `GITHUB_TOKEN`.

If we later **drop** the Docker Hub mirror, delete the login step and
the `docker.io/...` tags from `docker/metadata-action` output and the
secrets can be removed.

## Notes

- **Base image choice**: `gcr.io/distroless/nodejs24-debian12:nonroot`
  is the default; fall back to `node:24-alpine` only if a native
  dependency (e.g. future mDNS support in 3.1) resists distroless.
  Document whichever lands in `docs/user/installation.md`.
- **Arm builds take longer**: ~3–5 min added per release. Acceptable
  for a tag-triggered workflow; revisit only if releases become
  frequent enough to be painful.
- **No container on every `main` push**: chosen explicitly in planning
  to avoid a flood of rolling `:latest` images; re-open if users ask
  for a nightly / edge channel later and add a second workflow scoped
  to `workflow_dispatch` or `schedule`.
- **No Helm chart / Kubernetes manifest** in this step. Users who want
  to run under Kubernetes can wrap the image themselves; `.env` +
  compose is the supported shape in v1.
- **Security posture**: the container binds to `0.0.0.0:8787` by
  default (otherwise nobody outside the container can reach it). That
  is **only safe on a trusted LAN** — reiterate in the README and
  manual, same as PLAN.md.
- **Renovate / Dependabot**: add a `.github/dependabot.yml` entry for
  the `docker` ecosystem on the `Dockerfile` and for `github-actions`
  on `.github/workflows/` so the pinned versions stay fresh without
  manual attention. Opt-in for users who fork.
