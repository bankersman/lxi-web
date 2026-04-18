# 6.3 — One-click GitHub report (hardware / bug)

## Goal

Give a connected operator a **single action** that opens the project's
GitHub issue form with **every field the app already knows** filled in:
verbatim `*IDN?`, `*OPT?`, vendor/model/firmware, device kind, SCPI
port, mDNS discovery outcome, dashboard build, recent instrument error
queue entries, and a tail of the session SCPI transcript.

This step is written for **after Epic 5.1** — it assumes the
device-error ring, transcript ring, REST replay, and UI surfaces from
[5-1-scpi-observability.md](5-1-scpi-observability.md) already exist.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 6 (UX pass).
- Depends on:
  - [5-1-scpi-observability.md](5-1-scpi-observability.md) — error queue +
    transcript + REST + WS.
  - [6-1-keyboard-shortcuts.md](6-1-keyboard-shortcuts.md) — optional
    device-scoped shortcut to open the report flow.
- Issue templates: `.github/ISSUE_TEMPLATE/instrument-report.yml`,
  `.github/ISSUE_TEMPLATE/bug.yml` — field `id:` values must match
  query-parameter names in the prefilled URL.

## Scope

### Backend (minimal)

- **`DeviceIdentity.rawOpt`** — optional `readonly rawOpt: string` on
  `DeviceIdentity` in `@lxi-web/core`, populated when the session
  manager or driver refine path already issues `*OPT?` (or a
  vendor-equivalent such as `SYSTem:OPTion?`). If unsupported or
  timed out, omit the field (the issue template allows "unsupported"
  in the OPT textarea — the UI may leave that field empty for the user
  to fill).
- **`GET /api/meta/build`** — JSON body with at least:
  - `commit` — short git SHA (from `BUILD_COMMIT` / CI env at image
    build time),
  - `version` — semver from `package.json` or release tag when
    available,
  - `dockerDigest` — optional OCI image digest when running from the
    published container (`ghcr.io/...`).

  The `instrument-report` and `bug` templates both require a
  **Dashboard build** field — prefer `dockerDigest` when present,
  else `commit`, matching the placeholder style in the YAML forms.

### Web client

- **`buildInstrumentReportUrl(ctx)`** / **`buildBugReportUrl(ctx)`**
  pure helpers in `packages/web/src/lib/` (or similar) that:
  - Accept `SessionSummary`, optional slices of `DeviceErrorEntry[]`
    and `TranscriptEntry[]`, and build metadata.
  - Assemble
    `https://github.com/<owner>/<repo>/issues/new?template=<file>.yml&…`
    using `URLSearchParams`, mapping to the YAML form field `id:`
    names (`idn`, `opt`, `vendor`, `model`, `kind`, `firmware`,
    `scpi_port`, `discovery`, `worked`, `failed`, `scpi`, `build` for
    hardware reports; `steps`, `expected`, `actual`, `logs`, `build`,
    `browser` for bugs).
  - Enforce a **safe URL length** (~7 kB practical ceiling). If the
    assembled string exceeds the budget, **drop** the longest free-text
    fields first (`scpi`, then `failed` / `logs`), copy the full
    overflow body to the clipboard, and show a **`role="status"`** toast
    telling the user which form field to paste into.
- **Overview card** — a **Report** control (split button or dropdown)
  next to the existing quick actions:
  - **Hardware report** — `instrument-report.yml`
  - **Bug on this device** — `bug.yml`
- **Optional:** after 5.1 lands the device-error pill, add **Report
  this** on individual error rows that deep-links to `bug.yml` with
  that error quoted in `actual` or appended to `logs`.
- **Optional shortcut** (coordinates with 6.1): e.g. bind a key at
  `scope: "device"` to focus the Report menu or open the hardware
  report URL directly — exact key TBD so it does not collide with
  kind-scoped bindings.

### Repository configuration

- **`VITE_GITHUB_REPO` (or equivalent)** — build-time env for the
  `owner/repo` slug so forks can point "Report" at their fork's issue
  templates without editing source. Default `bankersman/lxi-web`.

### Non-goals

- **No GitHub App, PAT, or server-side issue creation** — the browser
  opens `github.com/.../issues/new?...` in a new tab; the user reviews
  and clicks Submit. Keeps the dashboard stateless w.r.t. GitHub auth.
- **No automatic screenshot / waveform attachment** — out of scope;
  user attaches files manually in the GitHub UI if needed.
- **No persistence of transcripts beyond 5.1** — rings are in-memory;
  reporting uses whatever is still in the ring when the user clicks.

## Acceptance criteria

- [ ] `DeviceIdentity` carries optional `rawOpt` when the connect /
      refine path successfully queries options; documented in core
      types; session list/detail payloads expose it to the web client.
- [ ] `GET /api/meta/build` returns JSON suitable for the templates'
      dashboard-build field; Docker / compose docs mention the env vars
      that stamp commit/digest into the image.
- [ ] `buildInstrumentReportUrl` / `buildBugReportUrl` are unit-tested
      for: happy path, URL-length truncation + clipboard fallback, and
      correct mapping of field ids to query params.
- [ ] Overview-card Report menu opens a new tab to the prefilled issue
      form; works for both `unknown` kind (still has `*IDN?`) and typed
      drivers.
- [ ] Hardware report prefill includes **at minimum**: `idn`, `opt`
      (when known), `vendor`, `model`, `firmware`, `kind`, `build`,
      and a text summary of recent **device errors** + **transcript
      tail** from 5.1 REST (not invented client-side).
- [ ] Bug report prefill includes `logs` (errors + transcript excerpt),
      `build`, `browser` (from `navigator.userAgent` / UA-CH where
      available); leaves `steps` / `expected` / `actual` for the user
      unless reporting from a specific error row.
- [ ] Accessibility: Report control is keyboard-reachable, has visible
      labels (no icon-only primary), overflow toast is polite
      `aria-live`.
- [ ] `docs/user/hardware-reports.md` gains a short **Using Report from
      the app** section describing the flow and the clipboard fallback.

## Notes

- GitHub issue forms accept query parameters matching YAML field `id:`
  values; verify against the live template after any template edit.
- Forks that change the repo slug must set the Vite env for `owner/repo`
  at build time — same idea as `DOCS_REPO_SLUG` for the static manual
  sync script.
- If Epic 5.1's REST shapes change during implementation, update this
  step's acceptance criteria to match the shipped route names and JSON
  field names — the *intent* (recent errors + transcript excerpt) is
  fixed.
