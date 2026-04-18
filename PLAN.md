---
name: LXI client and UI
overview: "Bench utility for solo/small-lab: Node 24+ pnpm monorepo, Fastify :8787, SCPI core + Rigol DHO804/DP932E/DM858, Vue grid dashboard (Router, Tailwind, Pinia, Lucide, uPlot, light/dark). Epics 3–4: LAN discovery + resilient sessions + detail UX; SCPI mock + first extra device kind. Git + progress.md per step."
todos:
  - id: git-init
    content: Initialize git repo, root .gitignore (Node, Vite, Vue, OS/IDE); first commit
    status: completed
  - id: bootstrap-monorepo
    content: pnpm workspaces — @lxi-web/core|server|web, Node>=24, Fastify stub :8787 (PORT env), @fastify/websocket, HOST env bind, Vite+Vue+VueRouter+TS+Tailwind+Pinia+Lucide+uPlot; progress.md + docs/steps stubs 1.1–2.7; commit
    status: completed
  - id: epic-1-1-transport-scpi
    content: Epic 1.1 — TcpTransport + ScpiSession (write/query/IEEE block, timeouts, errors); update progress.md + docs/steps/1-1-*.md; commit
    status: completed
  - id: epic-1-2-idn-registry
    content: Epic 1.2 — *IDN? parse, device kind enum, registry → façade factory, unknown handling; progress + step doc; commit
    status: completed
  - id: epic-1-3-facade-interfaces
    content: Epic 1.3 — IOscilloscope / IPowerSupply / IMultimeter + composition on ScpiSession; progress + step doc; commit
    status: completed
  - id: epic-1-4-rigol-pack
    content: Epic 1.4 — Rigol façades for DHO804 (scope), DP932E (PSU), DM858 (DMM); *IDN? patterns + TCP; progress + step doc; commit
    status: completed
  - id: epic-2-1-multi-session
    content: Epic 2.1 — Session manager (sessionId, metadata, lifecycle); progress + step doc; commit
    status: completed
  - id: epic-2-2-rest-ws
    content: Epic 2.2 — REST connect/list/disconnect + WebSocket multiplexed by sessionId; progress + step doc; commit
    status: completed
  - id: epic-2-3-vue-shell
    content: Epic 2.3 — Grid of device cards, kind icons, dot+text status, light/dark toggle, Add-device dialog, Tailwind light+dark tokens; progress + step doc; commit
    status: completed
  - id: epic-2-4-session-panels
    content: Epic 2.4 — Card mini-controls + expanded panels; scope hero uPlot + side controls; PSU/DMM full layouts; CSV/table; raw SCPI fallback; progress + step doc; commit
    status: completed
  - id: epic-2-5-psu-advanced
    content: Epic 2.5 — Advanced PSU features as optional capabilities on IPowerSupply (channel coupling via :OUTPut:PAIR, per-channel OVP/OCP via :OUTPut:O[V|C]P:*, CH1/CH2 tracking via :OUTPut:TRACk, 10-slot *SAV/*RCL preset memory); REST routes + UI panels (pairing, tracking, presets, protection) in PSU detail; Rigol DP900 driver (DP932E tested); progress + step doc; commit
    status: completed
  - id: epic-2-6a-dmm-range-triggering
    content: Epic 2.6a — DMM range + NPLC + AutoZero + triggering. Optional ranging/triggering capabilities on IMultimeter, 4-wire resistance added to MultimeterMode; REST /dmm/ranging, /dmm/trigger, /dmm/trigger/fire; UI Range & integration + Trigger cards; Rigol DM858 driver; progress + step doc; commit
    status: pending
  - id: epic-2-6b-dmm-math-dual
    content: Epic 2.6b — DMM math (null/dB/dBm/stats/limit) + dual display. Optional math/dualDisplay capabilities on IMultimeter; REST /dmm/math, /dmm/math/reset, /dmm/dual; UI Math card with pass/fail badge + dual-display strip; Rigol DM858 driver; progress + step doc; commit
    status: pending
  - id: epic-2-6c-dmm-logging-temperature
    content: Epic 2.6c — DMM trend logging + temperature + presets. Optional logging/temperature/presets capabilities on IMultimeter with shared InstrumentPresetCapability in @lxi-web/core (PSU retypes onto it); REST /dmm/logging/* (NDJSON stream), /dmm/temperature, /dmm/presets/*; UI Trend recorder with uPlot sparkline + CSV export, Temperature sub-card, Presets grid; Rigol DM858 driver; progress + step doc; commit
    status: pending
  - id: epic-2-7a-scope-capture-control
    content: Epic 2.7a — Scope capture control (trigger + acquisition). Optional trigger/acquisition capabilities on IOscilloscope with discriminated OscilloscopeTriggerConfig union, channel bandwidthLimit/invert/unit additions; REST /scope/trigger{,/sweep,/force}, /scope/acquisition, /scope/autoset, channel mutators; UI Trigger + Acquire tabs; Rigol DHO800 driver; progress + step doc; commit
    status: pending
  - id: epic-2-7b-scope-analysis
    content: Epic 2.7b — Scope analysis (measurements + cursors + math/FFT). Optional measurements/cursors/math capabilities with 41-item DHO800 catalog, statistics, Δ + 1/Δ cursor readouts, math incl. FFT (window/span/center); REST /scope/measurements{,/clear-stats}, /scope/cursors, /scope/math{,/waveform}; UI Measure + Cursors + Math tabs, math overlay on hero uPlot; Rigol DHO800 driver; progress + step doc; commit
    status: pending
  - id: epic-2-7c-scope-save-replay
    content: Epic 2.7c — Scope save & replay (references + history + screenshot + presets). Optional references/history/display/presets capabilities (shared InstrumentPresetCapability); REST /scope/references/* (incl. waveform), /scope/history{,/seek}, /scope/screenshot, /scope/display, /scope/presets/*; UI Refs grid with overlay, History scrubber, Display & Presets tab; Rigol DHO800 driver; progress + step doc; commit
    status: pending
  - id: epic-2-7d-scope-protocol-decoders
    content: Epic 2.7d — Scope protocol decoders (I2C/SPI/UART/CAN/LIN). Optional decoders capability with discriminated OscilloscopeDecoderConfig union, NDJSON packet stream with since=<seq>; REST /scope/buses{,/:id,/:id/packets}; UI Decoders tab with per-protocol forms + virtualised packet list + CSV export; Rigol DHO800 driver; progress + step doc; commit
    status: pending
  - id: epic-3-1-lan-discovery
    content: Epic 3.1 — LAN discovery (mDNS/DNS-SD); REST browse + Add-device pick-list; manual host/port fallback; keyboard/a11y; progress + docs/steps/3-1-*.md; commit
    status: completed
  - id: epic-3-2-resilient-connectivity
    content: Epic 3.2 — Resilient connectivity (reconnect/backoff, connection-lost UX, optional retry); session semantics documented; progress + docs/steps/3-2-*.md; commit
    status: completed
  - id: epic-3-3-session-persistence
    content: Epic 3.3 — Session persistence (saved connections, reopen last session on launch); no auth; progress + docs/steps/3-3-*.md; commit
    status: completed
  - id: epic-3-4-device-detail-ux
    content: Epic 3.4 — Device detail UX (per-kind section order, overview cards, quick actions within reason); progress + docs/steps/3-4-*.md; commit
    status: completed
  - id: epic-3-5-user-docs-and-landing
    content: Epic 3.5 — User documentation + landing page. README rewrite (two-path quick-start, supported-hardware table, screenshots, CTA), user manual under docs/user/ (installation, getting started, per-kind pages, raw SCPI, troubleshooting, hardware reports, roadmap), VitePress site under docs/site/ reusing docs/user/*.md, GH Pages workflow, .github/ISSUE_TEMPLATE/ (instrument-report.yml, bug.yml, feature.yml, config.yml), LICENSE (MIT). Progress + docs/steps/3-5-*.md; commit
    status: pending
  - id: epic-3-6-docker-image-and-release
    content: Epic 3.6 — Docker image + release workflow. Fastify serves built web dist in production (+ /healthz), multi-stage Dockerfile (distroless Node 24, nonroot, multi-arch amd64/arm64), docker-compose.yml, .github/workflows/release.yml on v*.*.* tags with shared sanity gate, GHCR + Docker Hub mirror via docker/metadata-action semver tags, build provenance attestation, auto-generated GitHub Release. Secrets (Docker Hub only) — DOCKERHUB_USERNAME + DOCKERHUB_TOKEN. Progress + docs/steps/3-6-*.md; commit
    status: pending
  - id: epic-3-7-npm-publish-core
    content: Epic 3.7 — @lxi-web/core npm publishing on v*.*.* tags (parallel to 3.6). Package audit (exports map for ., ./scpi, ./drivers/rigol; files allowlist; publishConfig.access public + provenance; sideEffects false; engines node >= 24), server and web pinned private, test:exports guard, packages/core/README.md, npm job on release workflow with version/tag match guard + provenance via OIDC, pre-releases under next dist-tag, docs/user/embed-core.md + Pages card. Secrets — NPM_TOKEN (automation token on @lxi-web scope). Progress + docs/steps/3-7-*.md; commit
    status: pending
  - id: epic-4-1-scpi-mock
    content: Epic 4.1 — SCPI TCP mock instrument(s) for dev/CI; configurable *IDN?, minimal typed SCPI per kind + unknown; progress + docs/steps/4-1-*.md; commit
    status: pending
  - id: epic-4-2-new-instrument-kind
    content: Epic 4.2 — First additional instrument kind (new I… facade + registry + dashboard/detail); one vendor driver or doc-driven stub; progress + docs/steps/4-2-*.md; commit
    status: pending
  - id: epic-5-1-event-bus
    content: Epic 5.1 — Cross-device event bus + action catalog on @lxi-web/core; façade event sources for scope/PSU/DMM; REST for schema/catalog/invoke; WebSocket events channel with filters and ring-buffer backfill; progress + step doc; commit
    status: pending
  - id: epic-5-2-rule-engine
    content: Epic 5.2 — Rule engine (when/then) with typed predicate tree, counters, debounce/cooldown, and safety interlocks that run without a browser attached; confirm-to-disable on safety rules; Rules page + activity log; progress + step doc; commit
    status: pending
  - id: epic-5-3-sequences
    content: Epic 5.3 — Sequences and parameter sweeps (action/wait/waitForEvent/capture/sweep steps), runner with cancel/pause/resume, CSV + JSON export, Sequences page with step editor and live run UI; progress + step doc; commit
    status: pending
  - id: epic-5-4-timeline
    content: Epic 5.4 — Correlated multi-device timeline with lanes per session, cross-session rule/sequence markers, persistent run recordings (NDJSON on disk), replay scrubber, csv-long/csv-wide/json/ndjson exports, retention policy; progress + step doc; commit
    status: pending
  - id: epic-5-5-lxi-trigger-bus
    content: Epic 5.5 — LXI hardware trigger bus research spike (Extended Functions / PTP / wired bus); document state of play and sketch IPtpClock / ITriggerBus capability shapes; optional common.triggerBroadcast software-trigger action with measured jitter; progress + step doc; commit
    status: pending
isProject: false
---

# LXI webapp: generic client (Epic 1) + multi-device dashboard (Epic 2)

## Purpose, audience, and product voice

- **Purpose:** A **browser dashboard** for **LXI-style LAN instruments** (SCPI over TCP): **connect several devices**, see **live state**, run **typed controls** per device class, and fall back to **raw SCPI** when there is no driver — without treating each vendor’s full PC app as the only way to work at the bench.
- **Audience:** **Solo engineers**, **makers**, and **small-lab** use: you understand **host, port, and `*IDN?`**, you run on a **trusted LAN**, and you want **clarity and control** more than enterprise IT features (no SSO, no audit multi-tenancy in v1).
- **Product voice / look-and-feel defaults:** **Utility-first bench software** — calm **neutral** chrome (light/dark per factsheet), **numbers and labels easy to scan**, **color used mainly for state** (connected / error / output on), not decoration. **One icon set** for the whole app (default at implementation: **Lucide**). **Locale:** **English** UI copy in v1 unless you add i18n later.

---

## Product scope (v1) — keep functionality sensible

- **One operator, one deployment:** a single person (or one lab machine) runs the **Node backend** and uses the **Vue UI** in a browser. **No** multi-user accounts, **no** roles/tenants, **no** shared concurrent editing, **no** per-user quotas — that is all explicitly **out of scope** until you need it.
- **“Multi-session” means multi-instrument:** the backend may hold **several TCP connections at once** so you can see your scope, PSU, and DMM together. That is **one** UI session talking to **one** backend process — not many unrelated users on the internet.
- **Prioritize features that help one person control lab gear:** reliable connect/disconnect, clear per-device state, safe defaults (e.g. confirm destructive actions, avoid surprise `*RST`), readable errors, and predictable API shapes. Add complexity only when a concrete workflow needs it.

---

## Pre-implementation — resolve before writing code

**Rule:** if something is **not** listed in **Implementation factsheet** below, pause and ask rather than guessing.

---

## Implementation factsheet (locked — use when building)

Use this section as the single checklist of defaults; **no need to re-ask** these in chat unless hardware or requirements change.

### Monorepo and package names

- **Package manager:** **pnpm** workspaces (`pnpm-workspace.yaml`).
- **Published / internal package names:** **`@lxi-web/core`**, **`@lxi-web/server`**, **`@lxi-web/web`** (directories can stay `packages/core`, `packages/server`, `packages/web` — map in each `package.json` `name` field).

### Runtime and server

- **Node:** **>= 24** (`engines` in root).
- **HTTP:** **Fastify** in `@lxi-web/server`.
- **WebSocket:** **`@fastify/websocket`** (official plugin; no separate `ws`-only server unless you hit a blocker).
- **API listen:** default **`127.0.0.1`**; **`HOST`** env overrides bind (e.g. `0.0.0.0` for LAN). Document trusted-network caveat in `README`.
- **API port:** default **`8787`**; override with **`PORT`** env. Vite dev **proxies** `/api` and `/ws` (or equivalent) to this port.

### HTTP vs WebSocket (transport rules of thumb)

The same Fastify process exposes both; pick per use case:

- **WebSocket (`/ws`)** — one long-lived connection per browser tab. Used for anything that updates continuously: session lifecycle (`sessions:init/update/removed`) **and** recurring instrument readings via `subscribe` / `unsubscribe` + `reading:update` / `reading:error` frames. The server runs **one scheduler loop per `(sessionId, topic)`** regardless of how many panels are subscribed, so the dashboard mini tile and detail page share a single device poll. Reading topics live in `@lxi-web/core` (`ReadingTopic`); v1 covers `dmm.reading`, `dmm.dualReading`, `psu.channels`, `scope.channels`, `scope.timebase`. New recurring feeds are added by extending the topic union and the server-side scheduler map; the browser uses the `useLiveReading` composable. See [docs/steps/2-2-rest-and-websocket.md § Live reading subscriptions](docs/steps/2-2-rest-and-websocket.md#live-reading-subscriptions).
- **REST (`/api/...`)** — one-shot reads and writes. Capability descriptors (ranging, trigger, math, temperature, presets…), user-initiated commands (mode change, Apply, preset save/recall), post-write snappy refreshes of the WS-backed state, binary downloads (scope screenshot / CSV), and the raw-SCPI escape hatch all stay on HTTP. REST endpoints for WS-backed topics are **retained** as a fallback for scripting, curl-testing, and post-write refresh.
- **Rule of thumb:** if multiple panels want the same value at a fixed cadence, it belongs on WebSocket. If a query is driven by navigation or user action and returns once, it stays on REST.

### Instrument TCP (lab side)

- **Default SCPI port in UI:** **5025** (common for Rigol/LAN); remain overridable per connection. Not the same as the API port **8787**.

### Frontend

- **Vue 3** + **Vite** + **Vue Router** + **TypeScript** + **Tailwind**.
- **State:** **Pinia** for sessions list, selected `sessionId`, WebSocket client handle, and UI chrome.
- **Charts:** **uPlot** for scope waveforms and compact numeric history/sparklines where needed; keep **CSV export** (and/or a simple data table) for accessibility alongside charts.

### Dashboard and visual representation (aligned with product owner)

- **Overall layout:** **responsive grid of device cards** — each **session** is one card on the main dashboard so every connected LXI device is visible at once. Cards expose **small “at a glance” readouts or controls** where feasible; **Expand** opens the **full control panel** via **Vue Router** at **`/device/:sessionId`** (bookmarkable, back button works). Use a **modal/drawer** only for **Add device** and other short flows, not for the main instrument workspace.
- **Card identity:** **device-kind icon** (scope / PSU / DMM / unknown) + **primary line** from **`*IDN?`** (short manufacturer + model) + **secondary line** with **host:port** (and session id only if useful for support, not as the headline).
- **Status:** **status dot** (semantic color) **plus** a **visible text label** (e.g. Connected, Connecting, Error) — never color-only; row/card gets an **`aria-label`** summarizing kind + state for assistive tech.
- **Oscilloscope detail (expanded):** **large hero `uPlot`** as the dominant element; **acquisition and channel controls** live in a **side column** or a **compact strip** so they do not shrink the waveform unnecessarily.
- **Theme:** **Light and dark** modes with a **persistent user toggle** (e.g. `localStorage` + `class` on root for Tailwind `dark:` variant). Optional nice touch: **initial** theme follows **`prefers-color-scheme`** on first visit only, then user choice wins. Toggle must be a **labeled** control (not icon-only).

### Primary lab hardware (Epic 1.4 targets)

Implement and manually verify against **your** gear (registry should match **`*IDN?`** substrings — firmware may add suffixes; use tolerant pattern matching):

- **Oscilloscope:** **Rigol DHO804** (DHO800 family).
- **Power supply:** **Rigol DP932E** (DP900-class ultra-slim line).
- **Multimeter:** **Rigol DM858** (bench DMM).

If a real `*IDN?` string differs from expectations, adjust patterns in `@lxi-web/core` and record the string in `docs/steps/1-4-*.md`.

### Unknown / unsupported models (v1)

- **Allow TCP session**; API + UI expose **raw SCPI** with **warnings**. Typed **Pinia** + panels only when a façade matches.

---

## Technology stack (locked)

- **Runtime:** **Node.js 24 or newer** everywhere tooling runs — root `engines.node: ">=24"` (and CI) so local dev, server, and Vue/Vite build all target the same baseline.
- **Language:** **TypeScript** end-to-end (shared DTOs/types between server and web where practical).
- **Monorepo tooling:** **pnpm** workspaces; packages **`@lxi-web/core`**, **`@lxi-web/server`**, **`@lxi-web/web`** (see **Implementation factsheet**).
- **Backend:** **Node** + **Fastify** + **`@fastify/websocket`**; instrument code in **`@lxi-web/core`**, imported by **`@lxi-web/server`**. **Bind / port:** see factsheet (**`HOST`**, **`PORT`** default **8787**).
- **Frontend:** **Vue 3 SPA** (Composition API + `<script setup>`), **Vite**, **Vue Router**, TypeScript, **Tailwind**, **Pinia**, **uPlot** for plots. Prefer **utility classes** in templates over Vue `<style scoped>` for layout, spacing, typography, and states; keep a single entry stylesheet (`@import "tailwindcss"` or equivalent) plus **Tailwind theme extensions** for semantic colors, radii, and fonts so the UI stays consistent. Reserve scoped/component CSS only where Tailwind cannot express it cleanly (rare).

Optional later: **Tauri/Electron** still reuses `packages/core`; not in v1 scope.

---

## Git, commits, and progress tracking

- **`git init` immediately** as the first implementation step (with a sensible root `.gitignore`). **Commit after every subplan/step** below completes — one focused commit per milestone (conventional prefixes welcome: `feat`, `fix`, `chore`, `docs`).
- **`progress.md`** at the **repository root**: a living **checklist** that mirrors the subplan order (same items as the YAML todos in this plan). **Update it when starting a step** (optional “Started” date) and **when finishing** (check the box, add “Done” date and one-line summary if useful). This file is the human-facing source of truth for “where we are”; keep it in sync with reality before each commit that closes a step.
- **One markdown file per subplan** under **`docs/steps/`** (filenames aligned with subplans, e.g. `1-1-transport-and-scpi-core.md`, `1-2-identity-and-routing.md`, … through `2-7-scope-advanced-features.md` for v1 + per-kind deep-dives, plus `5-1-…` through `5-5-…` for Epic 5). Each file holds: **goal**, **acceptance criteria** (checkboxes), **links** to the relevant plan section, and **notes** (decisions, model numbers tested). **Bootstrap** (second todo) may add **stub** files with headings and empty criteria to be filled when work begins, or create each file at the **start** of that subplan — either approach is fine; pick one and stay consistent.
- **Do not** bundle unrelated subplans into one commit; if a step is large, internal WIP commits on a branch are fine, but merge to `main` (or default branch) with a clear **final** commit message per subplan when possible.

---

## Constraint you cannot avoid in a browser

Instruments are reached over **raw TCP** (commonly **port 5025** for SCPI on many LAN instruments, including many Rigol models) or sometimes vendor-specific ports. **A normal web page cannot open that socket** to an arbitrary LAN IP. Architecture:

- **Vue SPA** in the browser (Epic 2)
- **Node backend** on the same LAN that holds TCP sockets and exposes **HTTP + WebSocket** to the UI

---

## UI quality and accessibility (non-negotiable for Epic 2)

Ship a dashboard that is **visually coherent** and **WCAG-minded** (aim for **2.1 AA** where feasible):

- **Structure:** landmarks (`header`, `nav`, `main`), one **skip link** to main content, logical heading order.
- **Forms:** every control has a visible **label** (or `aria-label` only when no room and pattern is clear); group related fields with `fieldset`/`legend` where it helps; associate validation errors with inputs (`aria-describedby` / `aria-invalid`).
- **Dynamic readings:** DMM/PSU readbacks and connection status use **`aria-live`** regions (polite for frequent updates; assertive sparingly) so screen readers get updates without stealing focus.
- **Keyboard:** full flow for connect/disconnect, pick device, adjust PSU, trigger scope capture — no mouse-only traps; documented shortcuts only if discoverable and not conflicting.
- **Focus:** visible **focus rings** (do not `outline: none` without replacement); focus moves sensibly after dialogs (e.g. “Add device”).
- **Color and motion:** contrast-safe palette and state colors (not color-only); respect **`prefers-reduced-motion`** for transitions and decorative animation.
- **Charts:** **uPlot** for waveforms; always offer **CSV export** and/or a compact **data table** alongside the plot for screen readers and audit trails.

Implementation aids: **eslint-plugin-vue** + **eslint-plugin-vuejs-accessibility**; **Tailwind** pairs well with accessible primitives (**Reka UI** / headless patterns) — style via utilities, not bespoke scoped blocks. Optional **eslint-plugin-tailwindcss** to catch invalid class names.

---

## Epic 1 — Generic client + “typed extensions”

Think in **three layers** (this is clearer than only `class X extends Y`):

```mermaid
flowchart TB
  subgraph ui [Vue_SPA]
    Dashboard[Dashboard_device_card_grid]
  end
  subgraph api [Node_backend]
    Ws[WebSocket_multiplexed]
    Http[HTTP_session_routes]
    Sessions[SessionManager_N_TCP]
  end
  subgraph core [Instrument_core]
    Tcp[TcpTransport]
    Scpi[ScpiSession_write_query]
    Cap[Capability_router_from_IDN]
  end
  subgraph devices [Device_facades]
    Osc[OscilloscopeFacade]
    Psu[PowerSupplyFacade]
    Dmm[MultimeterFacade]
  end
  Dashboard --> Ws
  Dashboard --> Http
  Ws --> Sessions
  Http --> Sessions
  Sessions --> Scpi
  Scpi --> Tcp
  Cap --> Osc
  Cap --> Psu
  Cap --> Dmm
  Osc --> Scpi
  Psu --> Scpi
  Dmm --> Scpi
```

### Subplans (Epic 1)

- **1.1 — Transport and SCPI core**  
  `TcpTransport` (connect, timeouts, newline framing), `ScpiSession` (`write`, `query`, IEEE definite-length binary blocks, optional `*OPC?` / `*WAI`, hook for `SYST:ERR?`). No vendor strings in this layer.

- **1.2 — Identity and routing**  
  Run `*IDN?` after connect; parse manufacturer/model/serial; map to a **device kind** (enum: `oscilloscope` | `powerSupply` | `multimeter` | `unknown`). Registry: `(vendor, modelPattern)` → façade factory when known. **If no façade:** session still **connected** with kind `unknown` / `rawScpi` and **warnings** in API + UI (see Pre-implementation — no hard reject for unidentified gear).

- **1.3 — Typed façades (v1 device kinds)**  
  Narrow interfaces for UI needs: **`IOscilloscope`**, **`IPowerSupply`**, **`IMultimeter`**. Composition over inheritance: each façade wraps `ScpiSession` / `IScpiPort`. **Optional capability pattern:** where a feature is vendor- or model-specific (e.g. PSU channel pairing, OVP/OCP, tracking, preset memory — see 2.5), expose it as an **optional capability object + optional methods** on the façade so the backend and UI can gate panels on `facade.capability !== undefined` without subclassing.

- **1.4 — Vendor packs (Rigol first)**  
  Implement façades for **DHO804** (scope), **DP932E** (PSU), **DM858** (DMM) over TCP; tolerant `*IDN?` pattern match per model family. Other vendors later use the same registry pattern.

### Layer A — Transport + SCPI session (vendor-agnostic)

- **`TcpTransport`**: connect, reconnect policy, read timeouts, newline handling (`\n` typical for SCPI), optional logging (redact secrets if any).
- **`ScpiSession`**: `write(cmd)`, `query(cmd) -> string`, `queryIEEEBlock(...) -> Uint8Array` for binary waveform blobs, **synchronization** (`*OPC?`, `*WAI` where appropriate), and **error queue** polling (`SYST:ERR?`) as a hook—not every vendor formats identically, but the pattern is universal enough to centralize.

This is your **generic client**. Everything vendor-specific stays out of here.

### Layer B — Device facades (typed API per device *class*)

Define **narrow TypeScript interfaces** for what the UI needs, not the full SCPI manual:

- **`IOscilloscope`**: e.g. `armSingle`, `readWaveform(channel)`, timebase/vscale setters if you expose them in the UI.
- **`IPowerSupply`**: e.g. `setOutput(enable)`, `setVoltageCurrent`, `measureVoltageCurrent`.
- **`IMultimeter`**: e.g. `configureDcVoltage(range)`, `readPrimaryMeasurement`.

These are the “typed extensions”: **not** primarily inheritance from one mega-class, but **composition**: each facade holds a `ScpiSession` (or a narrow `IScpiPort` interface) and implements commands for that class.

**v1 scope:** the three kinds above match the hardware you have **now**. Additional instrument categories belong in **Version 2** (see below)—same registry + façade pattern, new interface modules.

### Layer C — Vendor packs (multi-vendor without a giant switch)

- On connect, always run **`*IDN?`** and parse **manufacturer + model** (and optionally serial/options).
- A small **registry** maps `(manufacturer, modelPattern)` → factory that returns facades. **TCP connect failures** still fail fast with a clear error; **identified but unsupported models** get a **live raw-SCPI** session instead of blocking the operator.
- **Rigol** implementations come first (you can test); add **Keysight/Keithley/etc.** later by adding new small files, not by rewriting the core.

**Optional TypeScript technique:** use **branded types** for `InstrumentAddress` / `SessionId` so UI code cannot accidentally mix connections—especially important when **multiple devices** are connected.

---

## Epic 2 — Dashboard UI (every connected device visible and controllable)

**Product requirement:** the dashboard must surface **every active backend session** at once (**card grid**) and let the **single operator** **see state and send controls** on each card and in **expanded** full panels—not a single hidden “active instrument”. (Still not multi-user: one browser session to one backend is enough for v1.)

### Subplans (Epic 2)

- **2.1 — Multi-session backend**  
  Session table: stable `sessionId` per TCP connection, metadata (`host`, `port`, `idn`, `deviceKind`, connection state). Operations keyed by `sessionId` (disconnect, subscribe, commands). Enforce limits (max N sessions) if desired for safety.

- **2.2 — API contract**  
  REST: connect (returns `sessionId`), list sessions, disconnect. WebSocket: client sends `sessionId` (or subscribes to a room per session) so streams and RPC-style messages never cross wires between instruments.

- **2.3 — Vue dashboard shell (grid + chrome)**  
  **Vue Router:** `/` = card grid; **`/device/:sessionId`** = expanded workspace (see factsheet). **Header:** app title + **light/dark toggle** (labeled, persisted). **Main:** responsive **grid of device cards**. Global **“Add device”** opens an accessible **dialog** (focus trap, `aria-modal`). **Tailwind** semantic tokens for surfaces, borders, status colors in **light and `dark:`** variants. Cards: **Lucide** kind icon, **`*IDN?` short title**, **host:port**, **dot + text status**, disconnect, link to expand.

- **2.4 — Card mini-controls + expanded full panels**  
  **On the card:** compact actions / readouts appropriate to kind (e.g. PSU output on/off + V readback; DMM primary reading; scope “single capture” or last frame thumbnail if feasible without clutter). **Expanded view:** full **class-specific** layout — scope uses **hero `uPlot`** + controls in side column or strip; PSU/DMM use larger control blocks + live **`aria-live`** readouts; **unknown** uses raw SCPI with warnings. **CSV export** / table next to **uPlot** where applicable. **Pinia** for sessions, theme, expanded `sessionId`, and WS handle.

- **2.5 — Advanced PSU capabilities**  
  Extend `IPowerSupply` with **optional capability objects** (`pairing`, `protection`, `tracking`, `presets`) so vendor drivers can advertise features without forcing every PSU to implement them. Implement on the **Rigol DP900** driver (verified against **DP932E**): **channel coupling** (`:OUTPut:PAIR` — off / series / parallel, with UI rules that leave CH2 editable in series and lock it only in parallel), **per-channel OVP/OCP** (`:OUTPut:O[V|C]P:*` — enable, level, trip state, clear), **CH1↔CH2 tracking** (`:OUTPut:TRACk`), and **10-slot `*SAV` / `*RCL` preset memory** with `:MEMory:VALid?` catalog. Surfaced in the PSU detail page with capability-gated panels that re-query the device after every write and share a `refreshKey` so recall / pairing / tracking changes rehydrate all dependent UI state.

- **2.6 — Advanced DMM capabilities** (sliced into **2.6a / 2.6b / 2.6c**)  
  Extend `IMultimeter` with **optional capability objects** modelled on the **IVI-4.8 IviDmm** class so the DM858's 5½-digit feature set is actually reachable. Shared background and SCPI landscape live in the overview — [docs/steps/2-6-dmm-advanced-features.md](docs/steps/2-6-dmm-advanced-features.md).
  - **2.6a — Range, NPLC, triggering.** `ranging` + `triggering` capabilities on `IMultimeter`, plus **4-wire resistance** promoted to a first-class `MultimeterMode`. Manual-range picker with Auto option, NPLC chip bar, AutoZero tri-state (On / Off / Once), trigger source + slope + delay + sample-count + software-trigger action. See [docs/steps/2-6a-dmm-range-and-triggering.md](docs/steps/2-6a-dmm-range-and-triggering.md).
  - **2.6b — Math and dual display.** `math` + `dualDisplay` capabilities. `:CALCulate:FUNCtion NULL|DB|DBM|AVERage|LIMit` with Null snap, dBm reference-Ω, statistics readouts + Reset, pass/fail badge, and a secondary-reading strip gated by a `pairs[primary]` compatibility map. See [docs/steps/2-6b-dmm-math-and-dual-display.md](docs/steps/2-6b-dmm-math-and-dual-display.md).
  - **2.6c — Trend logging, temperature, presets.** `logging` + `temperature` + shared `presets` capabilities. Buffered `:SAMPle:COUNt` + `:INITiate` / `:FETCh?` / `:DATA:REMove?` streamed as **NDJSON** with a live uPlot sparkline + CSV export, `:UNIT:TEMPerature C|F|K` + transducer selection, and 10-slot `*SAV` / `*RCL` preset memory that introduces the shared `InstrumentPresetCapability` (PSU retypes onto it). See [docs/steps/2-6c-dmm-logging-and-temperature.md](docs/steps/2-6c-dmm-logging-and-temperature.md).

- **2.7 — Advanced scope capabilities** (sliced into **2.7a / 2.7b / 2.7c / 2.7d**)  
  Extend `IOscilloscope` with **optional capability objects** modelled on the **IVI-4.1 IviScope** class. Surfaced as tabs on the existing side column so the hero uPlot keeps its real estate, with every tab hidden when its capability is absent. Shared background and SCPI landscape live in the overview — [docs/steps/2-7-scope-advanced-features.md](docs/steps/2-7-scope-advanced-features.md).
  - **2.7a — Capture control.** `trigger` + `acquisition` capabilities, with a **discriminated** `OscilloscopeTriggerConfig` union so each of Edge / Pulse / Slope / Video / Pattern / Duration / Timeout / Runt / Window / Delay / Setup-Hold / Nth-Edge / I²C / SPI / UART / CAN / LIN gets a type-safe payload. Sweep mode (Auto / Normal / Single), `:TFORce`, acquisition modes (Normal / Average / Peak-Detect / High-Resolution), **memory depth** up to 25 Mpts, `:AUToset` with a confirm dialog, and the channel-state additions (`bandwidthLimit`, `invert`, `unit`). See [docs/steps/2-7a-scope-capture-control.md](docs/steps/2-7a-scope-capture-control.md).
  - **2.7b — Analysis.** `measurements` + `cursors` + `math` capabilities. 41-item DHO800 measurement catalog with statistics, Manual / Track / Auto cursors with Δ + 1/Δ readouts, and a math channel covering A±B, A×B, A÷B, integration, differentiation, sqrt / log / ln / exp / abs, and **FFT** (window + span + center) overlaid on the hero uPlot with a distinct color. See [docs/steps/2-7b-scope-analysis.md](docs/steps/2-7b-scope-analysis.md).
  - **2.7c — Save and replay.** `references` + `history` + `display` + shared `presets` capabilities. 10 reference-waveform slots with overlays on the hero plot, history / segmented-frame scrubber with keyboard + play/pause + frame-jump, display screenshot in PNG / BMP / JPG as a binary download, persistence selector, and the shared preset grid. See [docs/steps/2-7c-scope-save-and-replay.md](docs/steps/2-7c-scope-save-and-replay.md).
  - **2.7d — Protocol decoders.** `decoders` capability with a discriminated `OscilloscopeDecoderConfig` union per protocol (I²C / SPI / UART / CAN / LIN), `:BUS<N>:*` wiring, and an **NDJSON packet stream** with `since=<seq>` resumption. UI gives each bus its own protocol-specific form and a virtualised packet list with protocol-aware columns, filters, auto-scroll, and CSV export. See [docs/steps/2-7d-scope-protocol-decoders.md](docs/steps/2-7d-scope-protocol-decoders.md).

---

## Epic 3 — Usability and platform (solo bench)

**Goal:** Reduce friction for daily use on a trusted LAN: find instruments
without typing IPs, survive brief network glitches, restore the last bench
layout, and make **`/device/:sessionId`** scannable (most important information
and actions first). **Also** make the project **installable** and
**discoverable** by someone who has never touched the code: a clear README,
a user manual, a public landing page, a one-line Docker install, and an
optional `@lxi-web/core` npm publish for people who only want the drivers.
**Out of scope:** accounts, roles, and multi-tenant security — see
**Epic 6 (deferred)** in `progress.md`.

### Subplans (Epic 3)

- **3.1 — LAN discovery (mDNS / DNS-SD)**  
  Backend browse for an allowlisted set of service types (e.g. `_lxi._tcp`,
  `_scpi._tcp`, `_visa._tcp` — exact strings vary by vendor; discover empirically
  on your gear). REST endpoint returns candidates (host, port, hostname, TXT
  hints). Add-device dialog: **Scan** populates a list; user **confirms**
  before connect (no silent TCP opens to lab hardware). Manual **Host** /
  **Port** remains. Document limitations (different subnet, AP isolation,
  firewalls).  
  See [docs/steps/3-1-lan-discovery-mdns.md](docs/steps/3-1-lan-discovery-mdns.md).

- **3.2 — Resilient connectivity**  
  Detect TCP/session failure; surface **connection lost** state on the card and
  detail page; offer **Retry** with exponential backoff policy. Decide and
  document **`sessionId` semantics** on reconnect (new session vs stable slot).
  Optional: auto-retry for transient errors without wedging the UI.  
  See [docs/steps/3-2-resilient-connectivity.md](docs/steps/3-2-resilient-connectivity.md).

- **3.3 — Session persistence**  
  Persist a **saved connection list** (host, port, optional label) and optional
  **“reopen last session”** on app load (backend file or local config — pick one
  coherent story for single-operator). Must not require authentication.  
  See [docs/steps/3-3-session-persistence.md](docs/steps/3-3-session-persistence.md).

- **3.4 — Device detail UX**  
  Per **device kind**, order sections so the **hero** and safety-critical
  readouts come first (e.g. scope: waveform + arm/trigger; PSU: output state +
  measured V/I; DMM: primary reading + mode). Improve **overview** summary
  cards: copy IDN, disconnect, link to raw SCPI, last error if exposed — avoid
  large new backend features unless cheap. Align with existing accessibility
  rules (`aria-live`, focus order).  
  See [docs/steps/3-4-device-detail-ux.md](docs/steps/3-4-device-detail-ux.md).

- **3.5 — User documentation and landing page**  
  Make the project **immediately understandable** and **runnable within
  minutes** by someone who has never touched the code. README rewritten
  with a two-path quick-start (Docker recommended, pnpm from source),
  screenshots under `docs/assets/screenshots/`, supported-hardware table,
  and a "report your hardware" CTA. **User manual** authored as plain
  Markdown under `docs/user/` (installation, getting-started, one page
  per device kind that mirrors 2.5 / 2.6 / 2.7, raw SCPI fallback,
  troubleshooting, hardware reports, roadmap). **Landing page** built
  with **VitePress** under `docs/site/` that reuses the same Markdown so
  GitHub and Pages stay in sync, deployed by `.github/workflows/pages.yml`
  on push to `main`. Structured **GitHub issue templates** under
  `.github/ISSUE_TEMPLATE/` (instrument-report, bug, feature, config)
  so users with other LXI gear can share `*IDN?` strings and SCPI
  notes. **LICENSE = MIT** at the repo root. No secrets required
  (Pages uses the auto `GITHUB_TOKEN`).  
  See [docs/steps/3-5-user-documentation-and-landing.md](docs/steps/3-5-user-documentation-and-landing.md).

- **3.6 — Docker image and release workflow**  
  Turn installation into a one-liner. `@lxi-web/server` serves the built
  `@lxi-web/web` bundle in production (with SPA fallback and a
  `/healthz` endpoint), wrapped in a multi-stage **Dockerfile** on
  `gcr.io/distroless/nodejs24-debian12:nonroot`, built for
  `linux/amd64` + `linux/arm64`. A committed `docker-compose.yml` gives
  users a recommended recipe. **`.github/workflows/release.yml`** fires
  on `v*.*.*` tag pushes, runs a shared sanity gate
  (`pnpm -r typecheck && test && build`), then publishes the multi-arch
  image to **GHCR** (`ghcr.io/${{ github.repository }}`) and **Docker
  Hub** in parallel with semver tag fan-out (`:latest`, `:1.2.3`,
  `:1.2`, `:1`) via `docker/metadata-action`, attaches SLSA build
  provenance to both digests, and creates a GitHub Release with
  auto-generated notes. Versioning driven by `pnpm version <bump>` at
  the root; workflow fails fast if tag and `package.json#version`
  disagree. Secrets: **`DOCKERHUB_USERNAME`** + **`DOCKERHUB_TOKEN`**
  (GHCR reuses the auto-provided `GITHUB_TOKEN`).  
  See [docs/steps/3-6-docker-image-and-release.md](docs/steps/3-6-docker-image-and-release.md).

- **3.7 — `@lxi-web/core` npm publishing**  
  Let others reuse the typed drivers without the dashboard. Audit
  `packages/core/package.json` as a library — `exports` map for `.`,
  `./scpi`, and `./drivers/rigol`; `files: ["dist", "README.md",
  "LICENSE"]`; `publishConfig.access: public`;
  `publishConfig.provenance: true`; `sideEffects: false`; matching
  `engines.node >= 24` — and pin `@lxi-web/server` + `@lxi-web/web`
  as `"private": true`. Add a `pnpm --filter @lxi-web/core test:exports`
  guard that imports every declared subpath from a clean tmp dir. A
  parallel **`npm` job** on the release workflow from 3.6 verifies the
  tag matches `packages/core/package.json#version`, then runs
  `pnpm --filter @lxi-web/core publish --access public --provenance`
  (OIDC-signed provenance linked to the Actions run). Stable releases
  publish under `latest`; pre-releases (`-rc.N`, `-beta.N`) publish
  under `next`. A short `packages/core/README.md` covers install +
  minimal usage, and `docs/user/embed-core.md` (ingested into the
  Pages site from 3.5) is the consumer-facing page. Secret:
  **`NPM_TOKEN`** (automation token scoped to the `@lxi-web` scope).  
  See [docs/steps/3-7-npm-publish-core.md](docs/steps/3-7-npm-publish-core.md).

---

## Epic 4 — SCPI mock and additional device kinds

**Goal:** Enable development and CI **without** a full Rigol rack, and prove the
**registry + façade + dashboard** pipeline for **one** new instrument category
beyond the v1 trio.

**Order:** implement the **mock** first so new kinds and regression tests do not
depend on physical hardware.

### Subplans (Epic 4)

- **4.1 — SCPI / LXI-style mock instrument**  
  In-repo TCP server(s) speaking enough SCPI for tests: `*IDN?`, `SYST:ERR?`,
  newline framing, and a **minimal** command set per emulated kind (scope / PSU
  / DMM) plus an **unknown** string for raw-SCPI paths. Configurable host/port;
  scriptable from **pnpm** or CI. Used to validate WebSocket routing,
  `sessionId` isolation, and typed routes without LAN hardware.  
  See [docs/steps/4-1-scpi-mock-instrument.md](docs/steps/4-1-scpi-mock-instrument.md).

- **4.2 — First new instrument kind**  
  Add one new **`I…`** façade interface, device-kind enum value, registry entry,
  and **dashboard + detail** UI surface for **one** concrete driver (vendor
  module) **or** a documented stub backed by the mock until hardware exists.
  Examples from the backlog: signal/function generator, electronic load — pick
  one and ship end-to-end. Further categories stay in the Version 2 backlog.  
  See [docs/steps/4-2-first-new-instrument-kind.md](docs/steps/4-2-first-new-instrument-kind.md).

---

## Epic 5 — Cross-device orchestration

Epic 5 focuses on a different axis: **what happens _between_ connected
instruments**, independent of which kinds or how they were connected.

### Intent

Today a dashboard user can control each device individually. The bench
reality is that the interesting workflows are cross-device:

- "Step PSU CH1 0 → 5 V in 0.1 V steps; at each step read the DMM and
  single-capture the scope, then export the whole table as CSV."
- "If the DMM reads more than 500 mA, kill PSU CH1 output immediately — even
  if nobody has the browser open."
- "Count every scope trigger that fires during this experiment; plot them
  on the same timeline as my PSU output changes and my OVP trips."

Epic 5 builds the primitives that make these cases first-class, and does
so entirely in software. The v1 target Rigol trio is **LXI Core only**
(no wired trigger bus, no IEEE 1588 PTP), so the hardware-sync path is
explicitly a future-gated research spike — see **5.5** — rather than a
blocker for the useful work in **5.1–5.4**.

### Architecture at a glance

```mermaid
flowchart TB
  subgraph ui [Vue SPA]
    Dash[Dashboard]
    Rules[Rules page]
    Seq[Sequences page]
    Time[Timeline page]
  end
  subgraph orchestration [Orchestration layer]
    Bus[EventBus + ring buffer]
    Cat[ActionCatalog]
    Rule[RuleEngine + counters + interlocks]
    Run[SequenceRunner]
    Log[Timeline recorder]
  end
  subgraph existing [Existing layers from Epic 1 & 2]
    Sessions[SessionManager]
    Facades[Typed facades]
  end
  Facades --> Bus
  Facades --> Cat
  Rule --> Bus
  Rule --> Cat
  Run --> Bus
  Run --> Cat
  Bus --> Log
  Dash --> Bus
  Rules --> Rule
  Seq --> Run
  Time --> Log
  Sessions --> Facades
```

Nothing in the orchestration layer reaches around the existing façades or
session manager — it only consumes the event bus and action catalog that
the façades publish. This keeps Epic 5 vendor-neutral and keeps every
driver (including future ones from Epic 4) automatically compatible.

### Subplans (Epic 5)

- **5.1 — Cross-device event bus and action catalog**  
  Normalize the events every façade can emit (`triggerFired`,
  `measurementSample`, `outputStateChanged`, `protectionTripped`,
  `errorFlagRaised`, `connectionStateChanged`) and the actions every
  façade exposes, behind JSON-schema-validated catalog descriptors.
  REST for catalog + invoke, WebSocket `events` channel with session /
  kind filters, ring-buffer backfill so reconnecting clients see no
  gaps. This step is the plumbing for everything that follows.
  See [docs/steps/5-1-orchestration-event-bus.md](docs/steps/5-1-orchestration-event-bus.md).

- **5.2 — Rule engine with counters and safety interlocks**  
  Typed `when event / optional predicate / then action` rules with a
  small non-Turing-complete expression tree, named counters that
  emit their own events, debounce and cooldown per rule, and a
  `priority: "safety"` tier that runs first, fires even with no browser
  attached, and requires two-step confirm to disable. Rules page with
  activity log and counter strip.
  See [docs/steps/5-2-rule-engine-and-interlocks.md](docs/steps/5-2-rule-engine-and-interlocks.md).

- **5.3 — Sequences and parameter sweeps**  
  Imperative multi-step flows with `action`, `wait`, `waitForEvent`,
  `capture`, and first-class `sweep` steps. Runner with cancel / pause /
  resume, per-step progress events on the bus, results with captured
  values and waveform references, CSV + JSON export. Single-run-at-a-
  time in v1. Sequences and rules compose — a sequence step can emit
  events that a rule listens for, and a safety rule can abort an
  in-flight sequence.
  See [docs/steps/5-3-sequences-and-sweeps.md](docs/steps/5-3-sequences-and-sweeps.md).

- **5.4 — Correlated timeline and multi-device export**  
  A single time-axis view with lanes per session, event glyphs,
  sparklines of measurement samples, and cross-session markers for rule
  fires and sequence step boundaries. Persistent recordings on disk
  (NDJSON + manifest) activated by sequence runs, tagged rules, or
  manual Start. Exports in `csv-long`, `csv-wide`, `json`, `ndjson`;
  retention with pinning.
  See [docs/steps/5-4-correlated-timeline-and-export.md](docs/steps/5-4-correlated-timeline-and-export.md).

- **5.5 — LXI hardware trigger bus (research spike)**  
  Mostly a document: survey the LXI Extended Functions (PTP, wired
  trigger bus), confirm current hardware targets are Core-only, sketch
  future `IPtpClock` / `ITriggerBus` façade capabilities, and
  (optionally) ship a `common.triggerBroadcast` software action with
  measured jitter so users can at least fire multiple instruments
  nearly-simultaneously over SCPI today.
  See [docs/steps/5-5-lxi-hardware-trigger-bus-research.md](docs/steps/5-5-lxi-hardware-trigger-bus-research.md).

### Non-goals for Epic 5

- No arbitrary JavaScript in rules or sequences — predicates stay a typed
  expression tree, sequences stay a typed step list. Escape hatch is
  `common.raw` (already gated by 2.4's raw-SCPI warnings).
- No attempt to reproduce an existing automation framework (LabVIEW, Ni
  TestStand, Keysight PathWave). The goal is to make a **solo bench**
  operator's common cross-device workflows fast and safe, not to replace
  enterprise test systems.
- No PTP or wired trigger bus implementation on the v1 Rigol gear; see
  5.5 for the research-only scope.

---

## Version 2 (backlog)

**Goal:** extend coverage without redesigning v1—**Epic 4.2** delivers the first
additional **device kind** beyond the Rigol trio; further kinds follow the same
pattern. **Epic 3** covers **LAN discovery** and **platform** ergonomics
previously listed here. **Deeper per-kind features** on existing façades remain
the optional-capability pattern from **2.5 / 2.6 / 2.7**.

The authoritative, living list lives in `progress.md` under **Backlog — v2 and beyond**; this section records the shape of the work, not the ticking checklist.

### More device types (examples)

After **Epic 4.2**, add typed façades and UI panels as you acquire hardware or demand; illustrative categories:

- **Signal / function generators** and **Arbitrary waveform generators (AWG)**
- **Electronic loads** (constant I / V / R / P modes, measurement streaming)
- **Spectrum / network analyzers** (trace capture, marker queries)
- **Source measure unit (SMU)** (often straddles PSU + DMM semantics)
- **Frequency counter / timer**
- **Switch / matrix** (route selection)
- **Temperature / data loggers** (multi-channel rolling history with export)

Each gets an `I…` interface, `*IDN?` routing, vendor modules, and a dashboard surface—same pattern as the v1 trio.

### Deeper per-kind capabilities

Follow the **optional capability** pattern from 2.5 / 2.6 / 2.7 rather than growing the core façades. Known targets:

- **PSU (landed in 2.5):** channel coupling, OVP/OCP, tracking, numbered preset memory — **done** for Rigol DP900.
- **PSU follow-ups:** **named preset slots** (`:MEMory:STORe` / `:MEMory:LOAD`) and **OVP/OCP delay** (`:OUTPut:O[V|C]P:DELay`) to avoid nuisance-tripping fast transients.
- **DMM (planned in 2.6, sliced 2.6a / 2.6b / 2.6c):** manual range + NPLC + triggering + 4-wire resistance (2.6a), math (null/dB/dBm/stats/limit) + dual display (2.6b), buffered trend logging (NDJSON) + temperature + shared preset memory (2.6c).
- **DMM follow-ups:** frequency-measurement aperture, explicit digitize mode, per-range ACV / ACI bandwidth setting.
- **Oscilloscope (planned in 2.7, sliced 2.7a / 2.7b / 2.7c / 2.7d):** capture control — full trigger matrix + acquisition modes + memory depth (2.7a); analysis — 41-item measurements with statistics + cursors + math incl. FFT (2.7b); save & replay — reference waveforms + history/segmented frames + screenshot + presets (2.7c); protocol decoders — I²C / SPI / UART / CAN / LIN with NDJSON packet stream (2.7d).
- **Oscilloscope follow-ups:** pass/fail mask testing with a mask editor, zone trigger with an on-plot region editor, digital/logic channels on DHO804's MSO option, richer protocol-decoder waterfall view, reference-level thresholds (`:MEASure:SETup:MAX|MID|MIN`).
- **Shared across kinds:** `InstrumentPresetCapability` — introduced in 2.6c, re-used by 2.5 (via retype) and 2.7c — so PSU / DMM / scope all expose the same `{ slots }` shape rather than each re-declaring it.

### Device auto-discovery

**Implemented in Epic 3.1** (see [docs/steps/3-1-lan-discovery-mdns.md](docs/steps/3-1-lan-discovery-mdns.md)). Discovery runs **only on the backend** (the browser cannot scan the LAN portably). Design details:

- **mDNS / DNS-SD**: browse allowlisted service types (e.g. `_scpi._tcp`, `_lxi._tcp`, `_visa._tcp` — verify per vendor/firmware).
- **Optional later:** cautious HTTP identity probes (rate-limited); **NI-VISA** `list_resources()` on the host for USB/GPIB — not required for TCP v1.

### Platform-level follow-ups

- **Reconnect / persistent sessions** — **Epic 3.2 / 3.3**.
- **Recording / playback (broad)** — overlaps **Epic 5.4** (correlated timeline + on-disk NDJSON); keep a single design so simple “log readouts” does not duplicate orchestration recordings.
- **Auth and multi-user** — **Epic 6 (deferred)** in `progress.md`; only if the product leaves single-operator / trusted-LAN posture.

---

## Suggested repository layout (when you start coding)

- `progress.md`: root checklist mirroring subplans; updated when each step completes (see **Git, commits, and progress tracking**).
- `docs/steps/`: one markdown file per subplan (`1-1-…` through `2-7-…` for v1 + per-kind deep-dives; `3-1-…` through `3-7-…` for Epic 3; `4-1-…` through `4-2-…` for Epic 4; `5-1-…` through `5-5-…` for Epic 5) with goals and acceptance criteria.
- `docs/user/`: plain Markdown **user manual** (installation, getting-started, per-kind pages, raw SCPI fallback, troubleshooting, hardware reports, roadmap) — canonical source; authored in 3.5.
- `docs/site/`: **VitePress** scaffolding for the GitHub Pages landing page — ingests `docs/user/*.md`; authored in 3.5.
- `docs/assets/`: screenshots and static images referenced from the README, the user manual, and the Pages site.
- `.github/workflows/`: CI/CD. `pages.yml` deploys the Pages site (3.5); `release.yml` fires on `v*.*.*` tags and publishes the Docker image to GHCR + Docker Hub (3.6) and `@lxi-web/core` to npm with provenance (3.7).
- `.github/ISSUE_TEMPLATE/`: structured `instrument-report`, `bug`, `feature` templates for hardware feedback (3.5).
- `Dockerfile` + `docker-compose.yml`: at the repo root, authored in 3.6.
- `LICENSE`: MIT, at the repo root (3.5).
- `packages/core` (**`@lxi-web/core`**): `ScpiSession`, transports, `*IDN?` router, facades, Rigol drivers for **DHO804 / DP932E / DM858** (pure TS, no Vue)
- `packages/server` (**`@lxi-web/server`**): Fastify + `@fastify/websocket`, **session manager**, depends on `@lxi-web/core`
- `packages/web` (**`@lxi-web/web`**): **Vue 3 + Vite + Vue Router + Tailwind + Pinia + Lucide + uPlot** SPA; depends on `@lxi-web/core` for shared DTOs/types only (no server imports in bundle)

---

## Testing strategy with your Rigol gear

- **Integration tests** (manual or automated on your LAN): script that connects, `*RST` guarded behind a flag, then reads a known-safe query.
- **Contract tests** for parsers: `*IDN?` strings, IEEE definite-length blocks for waveforms.
- **Multi-session**: two simulated or real TCP peers to ensure WebSocket routing never mixes `sessionId`s.
- **Frontend:** component tests for forms (labels, validation); optional **axe** in CI on built HTML for regressions.

---

## What remains optional / later

**VISA/USB/GPIB** on the backend host (NI-VISA or equivalent) — not required for LXI/TCP v1. Stack and hardware targets are fully listed in **Implementation factsheet** above.
