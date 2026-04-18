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

- [x] **`docs/user/supported-hardware.md`** authored as the canonical matrix. Grouped by device kind with Vendor / Family / Variant / Status / Notes columns. Status values are **`Verified`** / **`Community`** / **`Preview`** / **`Reported`** with definitions at the top of the page. Every variant from 4.2 / 4.3 / 4.4 / 4.5 / 4.6 / 4.7 / 4.8 appears: Rigol DHO804 / DP932E / DM858 ship `Verified`, everything else ships `Preview`. Notes columns carry firmware-version quirks, missing capabilities, and port / discovery caveats (Owon port 3000, blank-manufacturer fallback, partial LXI conformance).
- [x] **Matrix page wired** into `docs/user/index.md`, the VitePress sidebar + top nav (`docs/site/.vitepress/config.ts` — new "Hardware" sidebar group under `/manual/` and standalone `/contributing/` sidebar), and the README supported-hardware section (rewritten as a flagship-Verified table + Preview bullet-list + link to the full matrix).
- [x] **Preview-driver CTA** — the matrix page and `docs/user/hardware-reports.md` both call out the "no hardware test — please file a report" path. Roadmap page mirrors the social contract. No UI pill in the app per the project decision.
- [x] **Expanded `docs/user/hardware-reports.md`** — documents the four-status lifecycle, the maintainer workflow (capture fixture → confirm resolver → add personality → flip matrix), and a "how to expedite a promotion" section pointing at raw-SCPI captures.
- [x] **`docs/contributing/adding-a-driver.md`** authored (new `docs/contributing/` folder) covering Path 1 (variant-add), Path 2 (family-add), Path 3 (new-kind proposal workflow), worked examples for each, the "hardware reports are the fast path" section, and a PR checklist.
- [x] **README supported-hardware section** rewritten with a flagship-Verified table (Rigol DHO804 / DP932E / DM858), a Preview-by-vendor bullet list, and a link to the full matrix. The raw-SCPI-fallback guarantee is reiterated.
- [x] **`instrument-report.yml`** refined: `report_kind` dropdown (first report / firmware update / regression / promote to Verified / IDN-only), required `*OPT?` + firmware + dashboard-build fields, optional non-standard-SCPI-port field for Owon, and mDNS-outcome dropdown. Top copy links to both the hardware-reports guide and the adding-a-driver guide.
- [x] **VitePress build** green (`cd docs/site && npm run build`). The sync script (`docs/site/scripts/sync-manual.mjs`) now copies both `docs/user/*.md` and `docs/contributing/*.md` into the site, rewriting cross-directory links (`../user/` → `/manual/`, `../contributing/` → `/contributing/`, `../steps/` → absolute GitHub URLs) so the build stays link-clean.
- [x] **Backlog hygiene pass** in `progress.md`: items Epic 4 shipped (electronic load, signal generator, spectrum analyzer; Siglent / Keysight / Owon vendor packs) remain listed as shipped steps; the backlog keeps only items *discovered* in Epic 4 and deliberately deferred (tracking generator on SSA3000X-R, logic-channel MSO UI, SSA5000A / N9xxx SA dialects, Rigol MSO5000 / DP700 / DM3000 families, Owon HDS USB-only, simulator record/replay, etc.). No Epic-4-completed work survives in the backlog as an open item.
- [x] **Roadmap page refresh** (`docs/user/roadmap.md`) marks Epic 4 shipped, names the `Preview → Community → Verified` matrix as the ongoing social contract, and points contributors at the new adding-a-driver guide.

## Notes

- The matrix is the **user-facing source of truth** for "what works?". `progress.md` remains the implementation-progress checklist; the hardware matrix is derivative but independently useful for someone shopping for compatibility.
- Keep the matrix **flat Markdown** (not auto-generated) — hand-editing per hardware report is the expected cadence, and a build-time generator would just invite skew.
- The "flagship support" excerpt on the README is a separate content from the matrix so it can stay short and marketing-friendly without needing to list every preview variant.
- When a variant gets flipped to `Verified`, update the Notes column with the firmware version tested + a short date. Over a few releases this becomes a useful compatibility history.
- Epic 4 completes at this step. Future new vendors / new variants follow `docs/contributing/adding-a-driver.md` and do not require an epic.
