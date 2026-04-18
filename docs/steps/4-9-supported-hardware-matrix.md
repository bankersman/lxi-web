# 4.9 — Supported-hardware matrix + contributor guide

## Goal

Consolidate everything Epic 4 ships into a **single user-facing hardware
matrix** and a **contributor-facing "how to add a vendor / family" guide**.
This is the last step in Epic 4 and closes the loop between the code
shipped in 4.2 – 4.8, the simulator personalities from 4.1, and the
eventual hardware reports that flip "Preview" entries to "Verified".

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (consolidation).
- Related:
  - [3-5-user-documentation-and-landing.md](3-5-user-documentation-and-landing.md) — user manual + VitePress site + issue templates.
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — simulator framework.
  - [4-2-driver-family-profiles.md](4-2-driver-family-profiles.md) — profile pattern (the core thing contributors need to understand).
  - [4-3-electronic-load.md](4-3-electronic-load.md), [4-4-signal-generator.md](4-4-signal-generator.md), [4-5-spectrum-analyzer.md](4-5-spectrum-analyzer.md) — new-kind steps feeding the matrix.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md), [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md), [4-8-vendor-pack-owon.md](4-8-vendor-pack-owon.md) — vendor packs feeding the matrix.

## Acceptance criteria

- [ ] **`docs/user/supported-hardware.md`** authored as the canonical matrix. Grouped by **device kind**, columns: `Vendor`, `Family`, `Variant`, `Status`, `Notes`.
  - `Status` values: **`Verified`** (hardware report received + confirmed by maintainer), **`Preview`** (simulator-only validation), **`Community`** (hardware report received from a user, not yet re-verified), **`Reported`** (IDN only — raw SCPI works, no driver written yet).
  - Every variant declared in 4.2 / 4.6 / 4.7 / 4.8 + new-kind drivers from 4.3 / 4.4 / 4.5 appears with an initial status per the rules of its shipping step (Rigol: `Verified` for DHO804 / DP932E / DM858, `Preview` for other Rigol variants; everyone else: `Preview` until hardware reports convert).
  - Notes column records firmware-version quirks, known-missing capabilities, recommended SCPI port if not 5025, and any discovery caveats.
- [ ] **`docs/user/supported-hardware.md` page is wired** into the user-manual index (`docs/user/index.md`), the VitePress sidebar (`docs/site/.vitepress/config.ts`), and the README supported-hardware section (which moves from an inline table to a link + a short "flagship support" excerpt).
- [ ] **Preview-driver rendering rule** (docs-only per project decision): each `Preview` row carries an inline "No hardware test — please file a report" CTA linking to the `instrument-report` issue template. No UI pill in the app. This is also called out once in `docs/user/roadmap.md` and `docs/user/hardware-reports.md`.
- [ ] **Expanded `docs/user/hardware-reports.md`**: explains the three-state status lifecycle (Preview → Community → Verified), what a maintainer does with a report (capture IDN / `*OPT?` / firmware in a test fixture, add a simulator personality if needed, bump matrix status), and how to expedite a promotion by sharing SCPI captures.
- [ ] **`docs/contributing/adding-a-driver.md`** authored (new folder `docs/contributing/`). Covers:
  1. Pick the vendor + family: does it match an existing facade + profile shape? If so, you're adding a variant, not a family.
  2. Add a variant row to the profile table; no code beyond the profile values.
  3. Add a simulator personality (JSON fixture is usually enough; TS handlers only for interactive commands) and a unit test asserting registry resolution.
  4. If it's a new family (different SCPI dialect in the same kind): add a driver class under the vendor directory and re-use the vendor's shared helpers.
  5. If it's a new kind entirely: hold — file a kind proposal (matches the pattern Epic 4.3 / 4.4 / 4.5 used).
  6. Hardware-report workflow: if a contributor has the hardware, encourage them to file a report; the matrix status moves to `Community`, then `Verified` after maintainer re-run.
- [ ] **README supported-hardware section rewritten** as a short excerpt with a link to the full matrix. Flagship entries (Rigol DHO804 / DP932E / DM858, Siglent SDS1000X-E / SPD3303X-E / SDM3065X, Keysight EDU36311A / DSOX2024A / 34461A) stay on the README for scannability; everything else lives in the matrix page.
- [ ] **Issue templates updated** under `.github/ISSUE_TEMPLATE/`: `instrument-report.yml` picks up the **status lifecycle** (dropdown: first report / firmware update / regression / promote-to-verified), asks for `*IDN?` + `*OPT?` + firmware version, and links to `docs/contributing/adding-a-driver.md`.
- [ ] **Pages site** rebuilds cleanly after the doc additions (`cd docs/site && npm run build`). The sync script from 3.5 picks up the new `supported-hardware.md` and `contributing/adding-a-driver.md` automatically.
- [ ] **Backlog hygiene pass**: `progress.md` "Backlog — v2 and beyond" edited so items that Epic 4 promoted into real steps (additional categories, further vendors) are removed from the backlog and replaced with the Epic 4 completion references. New backlog entries are added only for things *discovered* in 4.1 – 4.8 but deliberately deferred (tracking generator on SSA, logic-channel MSO UI, Keysight N9xxx SA driver, Owon USB-only scope lines, etc.).
- [ ] **Roadmap page refresh** (`docs/user/roadmap.md`) to reflect Epic 4's expansion and mention the "Preview → Verified" matrix as the next social contract.

## Notes

- The matrix is the **user-facing source of truth** for "what works?". `progress.md` remains the implementation-progress checklist; the hardware matrix is derivative but independently useful for someone shopping for compatibility.
- Keep the matrix **flat Markdown** (not auto-generated) — hand-editing per hardware report is the expected cadence, and a build-time generator would just invite skew.
- The "flagship support" excerpt on the README is a separate content from the matrix so it can stay short and marketing-friendly without needing to list every preview variant.
- When a variant gets flipped to `Verified`, update the Notes column with the firmware version tested + a short date. Over a few releases this becomes a useful compatibility history.
- Epic 4 completes at this step. Future new vendors / new variants follow `docs/contributing/adding-a-driver.md` and do not require an epic.
