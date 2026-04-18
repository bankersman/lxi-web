# 6.6 — VitePress manual polish

## Goal

Liven up the published VitePress manual without changing the
**utility-first** voice or the English-only policy. Safety-critical,
LAN-posture, and destructive-SCPI lines that today live inside body
prose should jump off the page using VitePress default-theme **custom
containers** (`::: tip` / `::: warning` / `::: danger` / `::: info`,
optional `::: details`). Pair that presentation pass with a short
accuracy sweep so the front-door docs match reality: the Docker image
has shipped, Epic 4 vendor packs 4.10–4.13 have shipped, and the
roadmap reflects that.

This sub-step is deliberately narrow: Markdown edits in
[docs/user/](../user/) and [README.md](../../README.md) only. No app
code, no new dependencies, no changes to the VitePress theme or to
[docs/site/scripts/sync-manual.mjs](../site/scripts/sync-manual.mjs).

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 6 (UX pass), sub-step 6.6.
- Related:
  - [3-5-user-documentation-and-landing.md](3-5-user-documentation-and-landing.md)
    — `docs/user/` canonical source + VitePress site + sync script.
  - [4-9-supported-hardware-matrix.md](4-9-supported-hardware-matrix.md)
    — precedent for `docs/user/` + sync-script-aware edits.
  - [6-5-visual-polish.md](6-5-visual-polish.md) — explicitly carved
    out `docs/user/` from its visual scope; 6.6 owns it.

## Scope

### Custom containers

All container edits happen in **[docs/user/](../user/)** (the
canonical source); the sync script copies them into `docs/site/manual/`
unchanged. Target the lines that already carry weight in prose but
disappear into body text:

**Security / LAN posture** — `::: warning` (or `::: danger` where the
consequence is a bricked bench or a publicly reachable SCPI port):

- [README.md](../../README.md) bench-utility blockquote
  (*A local bench utility — single operator… never expose this to the
  open internet*).
- [docs/user/installation.md](../user/installation.md) **Network
  posture** block (*Do not expose the API to the open internet. There
  is no auth layer*).
- [docs/user/index.md](../user/index.md) **What it cannot do** —
  *no accounts, no authentication*.

**Destructive SCPI** — `::: warning`:

- [docs/user/raw-scpi.md](../user/raw-scpi.md) **Safety defaults** —
  `*RST` gating and the "no implicit system writes" guarantee.

**High-friction troubleshooting** — `::: tip` or `::: warning`
depending on whether the entry is a fix or a gotcha:

- [docs/user/troubleshooting.md](../user/troubleshooting.md) — Owon
  `_lxi._tcp` skip + port **3000** manual-entry guidance.

Lean on `:::` blocks sparingly. If a page already reads well, leave
it alone. The test is: does this line, if skimmed past, cause a
surprise at the bench? If yes, promote it.

### Optional `::: details`

If a long reference block makes the page harder to scan on a repeat
visit — e.g. the cosign verification recipe in
[docs/user/installation.md](../user/installation.md) — wrap it in a
`::: details` block with a clear summary. Accept only when the
collapse genuinely helps scanning; do not collapse anything the
first-time reader needs.

### Accuracy sweep

Three known-stale spots, all present-tense fixes, no new facts:

- [README.md](../../README.md) Docker quick-start — the
  blockquote *"The container image ships in Epic 3.6 … until it lands,
  use the from-source path below"* is stale. Epic 3.6 shipped; see
  [progress.md](../../progress.md). Rewrite in present tense.
- [docs/user/installation.md](../user/installation.md) — opening
  line *"Two paths: a pre-built Docker image (recommended once Epic
  3.6 ships)…"* has the same issue. Rewrite in present tense.
- [docs/user/roadmap.md](../user/roadmap.md) — **In flight — Epic 4
  vendor pack expansion** still lists **4.10–4.13** as future work.
  `progress.md` marks them done. Fold the completed packs into
  **Shipped**, and either drop the **In flight** section or retitle
  it to reflect what is actually in flight (Epic 5 bench safety,
  Epic 6 UX pass). Keep **Next** / **Further out** consistent with
  the rest of the roadmap.

No other `docs/user/` content rewrites are in scope. If a container
edit surfaces additional staleness, capture it as a follow-up rather
than expanding this step.

### Verification

- `cd docs/site && npm run build` exits cleanly (no new warnings, no
  broken links from container-block syntax).
- `npm run dev` in `docs/site` renders each edited page with the
  expected container styling in both light and dark themes.
- `sync-manual.mjs` runs as part of `predev` / `prebuild` and copies
  the updated source verbatim — no script changes needed.

## Acceptance criteria

- [ ] All container edits live in [docs/user/](../user/) (and
      [README.md](../../README.md) where called out), not in
      `docs/site/manual/` directly — the sync script remains the
      single copy path.
- [ ] [README.md](../../README.md) bench-utility blockquote,
      [docs/user/installation.md](../user/installation.md) *Network
      posture*, and [docs/user/index.md](../user/index.md) *What it
      cannot do* carry a **warning** (or **danger**) container.
- [ ] [docs/user/raw-scpi.md](../user/raw-scpi.md) *Safety defaults*
      uses a **warning** container for the `*RST` gating + "no
      implicit system writes" guarantee.
- [ ] [docs/user/troubleshooting.md](../user/troubleshooting.md)
      Owon port-3000 / empty-scan entry uses a **tip** or **warning**
      container.
- [ ] [README.md](../../README.md) and
      [docs/user/installation.md](../user/installation.md) no longer
      reference Epic 3.6 as future work; Docker quick-start language
      is present tense.
- [ ] [docs/user/roadmap.md](../user/roadmap.md) reflects Epic 4
      vendor packs **4.10–4.13** as shipped; **In flight** block is
      either removed or retitled.
- [ ] `cd docs/site && npm run build` passes with no new warnings
      and no broken links.
- [ ] [progress.md](../../progress.md) 6.6 row flipped to `[x]` with
      a one-line shipped summary on completion (same habit as 6.1–6.5).
- [ ] No new npm dependencies; no edits under `packages/`, `docs/site/.vitepress/`,
      or `docs/site/scripts/`.

## Non-goals

- No translated manual — `docs/user/` + VitePress stay English-only
  per the Epic 6 non-goals.
- No new VitePress plugins, custom theme components, Mermaid add-ons,
  or image assets.
- No [docs/site/scripts/sync-manual.mjs](../site/scripts/sync-manual.mjs)
  changes. If a container syntax edge case surfaces a genuine bug in
  the sync script, log it as backlog.
- No prose rewrites beyond the three accuracy spots listed above.
- No app code, `packages/web` UI, or `docs/site/.vitepress/` theme
  edits — 6.5 owns in-app visual polish.

## Notes

- VitePress ships container support out of the box; no plugin,
  no config change. `docs/site/package.json` is on the `^1.5.0` line,
  which is well past the release that introduced container syntax.
- The "is skimming past this line dangerous?" test keeps the diff
  small. Every container is a claim that the line matters; over-using
  them makes them invisible, which defeats the purpose.
- 6.6 is order-independent from the rest of Epic 6. It does not touch
  the Vue app and can ship before or after 6.1–6.5 without conflicts.
