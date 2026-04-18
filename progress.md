# Progress

Living checklist mirroring the subplans. Update when a step finishes (check the box, leave a one-line summary).

## Foundations

- [x] **git-init** — `git init`, `.gitignore`, first commit.
- [x] **bootstrap-monorepo** — pnpm workspaces, `@lxi-web/core|server|web`, Fastify stub, Vue + Vite + Tailwind + Pinia + Router + Lucide + uPlot, docs scaffolding.

## Epic 1 — Generic client

- [x] **1.1 transport + SCPI core** — `TcpTransport` + `ScpiSession` (write, query, IEEE block). See [docs/steps/1-1-transport-and-scpi-core.md](docs/steps/1-1-transport-and-scpi-core.md).
- [x] **1.2 identity + routing** — `*IDN?`, device kind, registry → façade factory. See [docs/steps/1-2-identity-and-routing.md](docs/steps/1-2-identity-and-routing.md).
- [x] **1.3 typed façades** — `IOscilloscope`, `IPowerSupply`, `IMultimeter`. See [docs/steps/1-3-typed-facades.md](docs/steps/1-3-typed-facades.md).
- [x] **1.4 Rigol vendor pack** — DHO804 / DP932E / DM858. See [docs/steps/1-4-vendor-packs-rigol.md](docs/steps/1-4-vendor-packs-rigol.md).

## Epic 2 — Dashboard

- [x] **2.1 multi-session backend** — session manager keyed by `sessionId`. See [docs/steps/2-1-multi-session-backend.md](docs/steps/2-1-multi-session-backend.md).
- [x] **2.2 REST + WebSocket API** — connect/list/disconnect + WS broadcast of session updates, raw SCPI route, typed routes per device kind, and WS `subscribe`/`unsubscribe` reading-topic fan-out (server runs one scheduler loop per `(sessionId, topic)` shared across panels). See [docs/steps/2-2-rest-and-websocket.md](docs/steps/2-2-rest-and-websocket.md).
- [x] **2.3 Vue shell** — card grid, status, light/dark toggle, Add-device dialog. See [docs/steps/2-3-vue-dashboard-shell.md](docs/steps/2-3-vue-dashboard-shell.md).
- [x] **2.4 session panels** — card mini-controls + expanded panels; scope uPlot; raw SCPI fallback. See [docs/steps/2-4-per-session-detail-views.md](docs/steps/2-4-per-session-detail-views.md).
- [x] **2.5 PSU advanced features** — channel coupling (series / parallel), OVP/OCP per channel (enable / threshold / trip / clear), CH1↔CH2 tracking, and 10-slot `*SAV`/`*RCL` preset memory — all exposed as optional capabilities on `IPowerSupply`, implemented on the Rigol DP900 driver, and surfaced in the detail page. See [docs/steps/2-5-psu-advanced-features.md](docs/steps/2-5-psu-advanced-features.md).
- **2.6 DMM advanced features** — sliced into three sub-steps; overview and shared IVI-4.8 / DM858 research in [docs/steps/2-6-dmm-advanced-features.md](docs/steps/2-6-dmm-advanced-features.md).
  - [x] **2.6a range, NPLC, triggering** — `ranging` + `triggering` capabilities on `IMultimeter`, 4-wire resistance and temperature added as first-class modes. DM858 implements `setRange` / `setNplc` / `setAutoZero` / `setTriggerConfig` / software `trigger()`. REST: `/dmm/ranging`, `/dmm/trigger`, `/dmm/trigger/fire`. UI: capability-aware range & NPLC & autoZero selectors + trigger form + software-fire button. See [docs/steps/2-6a-dmm-range-and-triggering.md](docs/steps/2-6a-dmm-range-and-triggering.md).
  - [x] **2.6b math + dual display** — `math` (null/dB/dBm/stats/limit) and `dualDisplay` capabilities with pass/fail badge and secondary-reading strip. DM858 drives `:CALCulate:FUNCtion` and `:DISPlay:WINDow2`. REST: `/dmm/math`, `/dmm/math/reset`, `/dmm/dual`, `/dmm/dual/reading`. UI: inline math form with statistics readout + limit pass/fail pill + dual-mode secondary reading underneath the primary. See [docs/steps/2-6b-dmm-math-and-dual-display.md](docs/steps/2-6b-dmm-math-and-dual-display.md).
  - [x] **2.6c trend logging + temperature + presets** — in-memory NDJSON-style `logging` stream with interval / total / running status, `temperature` (unit + transducer) capability, and shared `InstrumentPresetCapability` (PSU retyped onto it). REST: `/dmm/logging/{start,stop,samples}`, `/dmm/temperature`, `/dmm/presets/*`. UI: trend-logger controls with live sample tail, temperature unit/transducer form, 10-slot preset grid (save/recall). See [docs/steps/2-6c-dmm-logging-and-temperature.md](docs/steps/2-6c-dmm-logging-and-temperature.md).
- **2.7 Scope advanced features** — sliced into four sub-steps; overview and shared IVI-4.1 / DHO800 research in [docs/steps/2-7-scope-advanced-features.md](docs/steps/2-7-scope-advanced-features.md).
  - [x] **2.7a capture control** — `trigger` (edge / pulse / slope / video / runt / window / timeout / nth-edge configs) + `acquisition` (Normal / Average / Peak-Detect / High-Res, memory depth up to 25 Mpts, `:AUToset`, run/stop, sweep Auto/Normal/Single + force) + channel bandwidth / invert / unit setters on DHO800. REST: `/scope/trigger`, `/scope/trigger/sweep`, `/scope/trigger/force`, `/scope/acquisition`, `/scope/autoset`, `/scope/run|stop`, `/scope/channels/:ch`. UI: trigger form with sweep buttons + force; acquisition form with mode/averages/memory depth + autoset/run/stop. See [docs/steps/2-7a-scope-capture-control.md](docs/steps/2-7a-scope-capture-control.md).
  - [x] **2.7b analysis** — `measurements` (22-item catalog with Vmax/Vpp/rms/freq/period/duty/…, stats support) + `cursors` (Off / Manual / Track / Auto with Δ + 1/Δ readout) + `math` (arithmetic + FFT with window / span / center) capabilities on DHO800. REST: `/scope/measurements`, `/scope/measurements/clear-stats`, `/scope/cursors`, `/scope/math`, `/scope/math/waveform`. UI: dynamic measurement selector list with live polling, cursor mode/axis form with Δ / 1/Δ panel, math operator / source / FFT form. See [docs/steps/2-7b-scope-analysis.md](docs/steps/2-7b-scope-analysis.md).
  - [x] **2.7c save and replay** — `references` (10 slots with save / show / hide), `history` (frame count + scrubber + play/pause), `display` (PNG/BMP/JPG screenshot via `:DISPlay:DATA?` + persistence modes), shared `presets` on DHO800. REST: `/scope/references/*`, `/scope/history`, `/scope/display`, `/scope/screenshot?format=`, `/scope/presets/*`. UI: ref slot grid, history scrubber, persistence selector + screenshot download links, 10-slot preset grid. See [docs/steps/2-7c-scope-save-and-replay.md](docs/steps/2-7c-scope-save-and-replay.md).
  - [~] **2.7d protocol decoders** — `decoders` capability with I²C / SPI / UART / CAN / LIN discriminated configs, 2 buses on DHO800, `:BUS:MODE` + protocol-specific source/baud commands. REST: `/scope/buses`, `/scope/buses/:id`, `/scope/buses/:id/packets` (polling endpoint with `since=<seq>` paging over an in-memory buffer; NDJSON streaming variant tracked as backlog). UI: compact bus status + on/off (per-protocol configuration forms and the virtualised packet list with CSV export are tracked under "Protocol-decoder waterfall" in the backlog). See [docs/steps/2-7d-scope-protocol-decoders.md](docs/steps/2-7d-scope-protocol-decoders.md).

## Epic 3 — Usability and platform

- [x] **3.1 LAN discovery (mDNS)** — `DiscoveryService` backed by `bonjour-service` browses `_lxi._tcp` / `_scpi-raw._tcp` / `_hislip._tcp` / `_visa._tcp` on demand, dedupes per-host with a `scpi-raw`-first port preference, and teardown-per-scan so no UDP listener lingers. REST: `GET /api/discovery?timeoutMs=<ms>`. UI: Scan panel in Add-device dialog with keyboard-operable result list, `aria-live` count, graceful empty-scan state; manual host/port path unchanged. See [docs/steps/3-1-lan-discovery-mdns.md](docs/steps/3-1-lan-discovery-mdns.md).
- [x] **3.2 resilient connectivity** — `ScpiSession.onClose` exposes unexpected TCP drops; `SessionManager` flips the row to `error` in-place (sessionId stays stable across reconnects, per stateless-server design) and emits `sessions:update`; `POST /api/sessions/:id/reconnect` re-runs the connect + identify + driver-resolution flow. `DeviceCard` + `DeviceView` grow a **Reconnect** button on error, with text-labelled state (never color-only). Automatic backoff deferred — solo-bench operator is always in the loop, silent retry hides misconfigurations. See [docs/steps/3-2-resilient-connectivity.md](docs/steps/3-2-resilient-connectivity.md).
- [x] **3.3 session persistence** — Browser-local address book in `lxi-web.savedConnections.v1` (Pinia store + `watch` serializer, versioned schema). Every successful `sessions.open` upserts the address; Add-device dialog gains a "Saved connections" pane with Connect / Rename / Forget / auto-connect per row; dashboard grows a **Reopen saved** action in header and empty-state. Auto-opt-in is explicit per entry — the store auto-reopens flagged rows exactly once, on the first `sessions:init` frame, so later WS reconnects don't override manual disconnects. No server-side storage. See [docs/steps/3-3-session-persistence.md](docs/steps/3-3-session-persistence.md).
- [x] **3.4 device detail UX** — Added `DeviceOverviewCard.vue` as the first landmark inside `/device/:sessionId`: kind icon + short identity, status indicator with inline Reconnect, error alert, Vendor/Model/Serial/Firmware grid, and a quick-actions row (Copy `*IDN?`, Raw SCPI jump, Auto-connect toggle, Disconnect). Kind-specific panels are unchanged; the raw SCPI collapsible gained an `id="raw-scpi"` anchor so the overview button scrolls to it and focuses the input. Documented per-kind section order in [docs/steps/3-4-device-detail-ux.md](docs/steps/3-4-device-detail-ux.md).
- [x] **3.5 user documentation + landing page** — Rewrote README as a proper front door (hero, at-a-glance bullets, two-path quick start, supported-hardware table, architecture sketch, hardware-report CTA). Added a full user manual under `docs/user/` (overview, installation, getting started, per-kind oscilloscope/PSU/DMM pages, raw SCPI, troubleshooting, hardware reports, roadmap). Scaffolded a VitePress site under `docs/site/` as a standalone npm project; a `sync-manual.mjs` pre-build step copies `docs/user/*.md` into `docs/site/manual/` and rewrites `../../<repo-file>` links to absolute GitHub URLs so VitePress renders without dead-link errors. Verified `cd docs/site && npm run build` locally. Added `.github/workflows/pages.yml` (paths filter, Pages concurrency, no extra secrets) that deploys on push to `main`. Added issue templates (`instrument-report.yml`, `bug.yml`, `feature.yml`, `config.yml`). `LICENSE` (MIT) at repo root + `"license": "MIT"` in every `package.json`. Screenshots deferred until a mock-instrument backend exists. See [docs/steps/3-5-user-documentation-and-landing.md](docs/steps/3-5-user-documentation-and-landing.md).
- [x] **3.6 Docker image + release workflow** — Added `@fastify/static` serving of the built web dist with SPA fallback (non-`/api/*`, non-`/ws`, non-`/healthz` routes resolve to `index.html`); new `GET /healthz` endpoint with test coverage. Multi-stage `Dockerfile` (`node:24-alpine` → `gcr.io/distroless/nodejs24-debian12:nonroot`) uses `pnpm deploy --legacy` to produce a self-contained runtime tree; locally-built image is **160 MB** and passes smoke tests for `/`, `/healthz`, `/api/health`, and SPA deep links. Added `docker-compose.yml` with a distroless-friendly health check, a `.dockerignore`, `.github/workflows/release.yml` (sanity gate with tag/version assertion, Buildx multi-arch to GHCR + optional Docker Hub via `docker/metadata-action`, SLSA provenance, auto-generated GitHub Release), and `.github/dependabot.yml`. Docker Hub publish is opt-in via `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets — forks without those still get GHCR. Extended `docs/user/installation.md` with Docker, compose, cosign, and env-var reference. See [docs/steps/3-6-docker-image-and-release.md](docs/steps/3-6-docker-image-and-release.md).
- [x] **3.7 `@lxi-web/core` npm publishing** — Audited `packages/core/package.json` for library use: `description`, `keywords`, `repository`, `homepage`, `bugs`, `engines.node >=24`, `sideEffects: false`, an explicit `exports` map for `.`, `./browser`, `./scpi`, `./drivers/rigol` (+ `./package.json`), `files: ["dist", "README.md", "LICENSE"]`, `publishConfig.access: public` + `publishConfig.provenance: true`, and a `prepack` that copies the repo-root MIT license into the tarball. Added a `test:exports` test that imports every declared subpath and asserts the public symbols; `pnpm pack` output verified to contain only `dist/**`, `package.json`, `README.md`, `LICENSE`. Authored `packages/core/README.md` and `docs/user/embed-core.md`; wired the embed-core page into the VitePress sidebar and added a matching feature card on the landing page. Extended `.github/workflows/release.yml` with an `npm` job that runs in parallel with `docker`, asserts tag/`packages/core/package.json` match, picks the npm dist-tag automatically (`next` for prereleases, `latest` otherwise), and calls `pnpm publish --access public --provenance --tag …` with `id-token: write`. The publish step is guarded by `NPM_TOKEN`, so forks without the secret see a skip warning and the rest of the release still runs. See [docs/steps/3-7-npm-publish-core.md](docs/steps/3-7-npm-publish-core.md).

## Epic 4 — Simulator, driver families, new device kinds, vendor coverage

- [x] **4.1 simulator framework** — Private `@lxi-web/sim` workspace at `packages/sim/` with `SimulatorPersonality` / `Simulator` / `SimulatorSession` / `PersonalityRegistry`; handler resolution order **exact → prefix → fixture.responses → SCPI common built-ins (`*IDN?`, `*OPT?`, `*RST`, `*CLS`, `*OPC?`, `*STB?`, `*ESR?`, `SYST:ERR?`) → `-113 Undefined header`**; IEEE 488.2 definite-length block encoder; personalities `rigol-dho804` / `rigol-dp932e` / `rigol-dm858` / `generic-unknown`; CLI with `--personality` / `--port` / `--host` / `--serial` / `--idn` / `--opt` / `--config` / `--list` / `--verbose` + env overrides; bench config `bench.rigol.json` (DHO804 @ 5025, DP932E @ 5026, DM858 @ 5027); root scripts `pnpm sim`, `pnpm sim:rigol`, `pnpm test:sim`; integration test connects `ScpiSession.openTcp` → `parseIdn` → `createDefaultRegistry().resolve` → driver instance for every Rigol personality. See [docs/steps/4-1-scpi-mock-instrument.md](docs/steps/4-1-scpi-mock-instrument.md).
- [ ] **4.2 driver family profiles + `*OPT?` refinement** — Rename `dho804.ts`→`dho800.ts`, `dp932e.ts`→`dp900.ts`, `dm858.ts`→`dm800.ts` (deprecation alias for `RigolDm858`); lift variant-specific constants into `{Family}Profile` types; variant tables (DHO802/804/812/814, DP932E/U/DP912, DM858/858E); catch-all per family; optional async `refine(profile, port)` hook; shared helpers in `drivers/rigol/_shared/`. No behaviour change on existing DHO804 / DP932E / DM858. See [docs/steps/4-2-driver-family-profiles.md](docs/steps/4-2-driver-family-profiles.md).
- [ ] **4.3 instrument kind: electronic load** — `IElectronicLoad` facade (CC/CV/CR/CP modes + optional dynamic/list/protection/battery/logging/presets); `DeviceKind` grows `electronicLoad`; Rigol DL3000 profile-driven driver (DL3021/DL3031); simulator personality + stub siglent-sdl1020x-e; REST `/eload/*` + WS `eload.measurement`/`eload.state`; dashboard card + detail page; `docs/user/electronic-load.md`. See [docs/steps/4-3-electronic-load.md](docs/steps/4-3-electronic-load.md).
- [ ] **4.4 instrument kind: signal / AWG** — `ISignalGenerator` facade with discriminated waveform-type union + optional modulation/sweep/burst/arbitrary/sync/presets; `DeviceKind` grows `signalGenerator`; Rigol DG800/DG900 profile-driven driver; simulator personalities rigol-dg812/dg932 + stubs siglent-sdg2042x/keysight-33511b; REST `/sg/*` (incl. arbitrary upload) + WS `sg.channels`; dashboard card + detail page; `docs/user/signal-generator.md`. See [docs/steps/4-4-signal-generator.md](docs/steps/4-4-signal-generator.md).
- [ ] **4.5 instrument kind: spectrum analyzer** — `ISpectrumAnalyzer` facade (discriminated frequency input, trace read via IEEE block, trace/input/marker + optional channelPower/trigger/limitLines/averaging/presets); `DeviceKind` grows `spectrumAnalyzer`; Siglent SSA3000X profile-driven driver (bootstraps `drivers/siglent/`); simulator personality siglent-ssa3032x with tone injector + stubs rigol-rsa3030/keysight-n9320; rate-limited WS `sa.sweep`; dashboard card + detail page with uPlot trace + markers; `docs/user/spectrum-analyzer.md`. Tracking generator and SSA5000A dialect deferred. See [docs/steps/4-5-spectrum-analyzer.md](docs/steps/4-5-spectrum-analyzer.md).
- [ ] **4.6 vendor pack: Siglent** — Profile-driven drivers under `drivers/siglent/` covering SDS scopes (SDS1000X-E, SDS800X-HD, SDS2000X-Plus/HD, SDS3000X-HD, SDS6000A), SPD PSUs (SPD1168X, SPD1305X, SPD3303X-E/C), SDM DMMs (SDM3045X, SDM3055, SDM3065X), plus Siglent variants in new-kind drivers (SDL / SDG / SSA); simulator personalities; tolerant manufacturer regex; all entries Preview until community reports convert. See [docs/steps/4-6-vendor-pack-siglent.md](docs/steps/4-6-vendor-pack-siglent.md).
- [ ] **4.7 vendor pack: Keysight (+ legacy Agilent)** — Profile-driven drivers under `drivers/keysight/` covering InfiniiVision scopes (1000X/2000X/3000T/4000X/6000X DSOX+MSOX), E36xxx / EDU36xxx PSUs (EDU36311A, E36100-series, E36300-series, legacy E364xA), Truevolt DMMs (34450A/34461A/34465A/34470A), plus Keysight variants in new-kind drivers (EL34143A/EL34243A, 33500B/33600A); N9xxx SA reserved. Manufacturer regex accepts both "Keysight" and "Agilent Technologies". Simulator personalities per family. All entries Preview. See [docs/steps/4-7-vendor-pack-keysight.md](docs/steps/4-7-vendor-pack-keysight.md).
- [ ] **4.8 vendor pack: Owon** — Smallest-scoped pack due to partial LXI conformance. Profile-driven drivers under `drivers/owon/` for XDM DMMs (XDM1041/1241/2041), SPE PSUs (SPE3103/3051/6053/6103), XDS3000 scopes (XDS3102A/3104AE). Narrower capability surface (no advanced math/logging/decoders). Per-driver `defaultPort` hint (Owon often listens on 3000); manufacturer regex copes with empty-manufacturer + "Owon" / "Lilliput". Simulator personalities per family. SG / e-load / SA categories deferred. See [docs/steps/4-8-vendor-pack-owon.md](docs/steps/4-8-vendor-pack-owon.md).
- [ ] **4.9 supported-hardware matrix + contributor guide** — New `docs/user/supported-hardware.md` canonical matrix grouped by device kind with Vendor / Family / Variant / Status / Notes columns and Verified / Preview / Community / Reported lifecycle; wired into user-manual index + VitePress sidebar + README flagship excerpt. Expanded `docs/user/hardware-reports.md` explains promotion workflow. New `docs/contributing/adding-a-driver.md` covers variant-add / family-add / kind-add paths. Refined `.github/ISSUE_TEMPLATE/instrument-report.yml`. Backlog hygiene: promote items from v2 backlog that Epic 4 shipped. Roadmap refresh. See [docs/steps/4-9-supported-hardware-matrix.md](docs/steps/4-9-supported-hardware-matrix.md).

## Epic 6 — Deferred (platform / enterprise)

- [ ] **Auth and multi-user** — Only if the product leaves single-operator / trusted-LAN posture. Not scheduled.

## Backlog — v2 and beyond

Items explicitly deferred from v1 or beyond Epic 4. Not committed to an order; pick up when the relevant hardware or use case lands.

### Further instrument kinds (after Epic 4)

Epic 4 lands electronic load (4.3), signal / AWG (4.4), and spectrum analyzer (4.5). The following stay backlog and follow the same facade + registry + simulator + hardware-report pattern:

- [ ] **Network analyzers** (scalar / vector — trace capture + S-parameters).
- [ ] **Source measure unit (SMU)** — often straddles PSU + DMM semantics.
- [ ] **Frequency counter / timer**.
- [ ] **Switch / matrix** (route selection).
- [ ] **Temperature / data loggers** (multi-channel rolling history with export).
- [ ] **LCR meters**.

### Further vendor coverage (after Epic 4)

Epic 4 lands Siglent (4.6), Keysight + legacy Agilent (4.7), and Owon (4.8). Follow-ups:

- [ ] **Siglent SSA5000A spectrum analyzer dialect** — different SCPI command tree from SSA3000X; separate driver class under `drivers/siglent/ssa5000/`.
- [ ] **Keysight N9xxx spectrum analyzers** (CXA / BSA / PXA / UXA) — large SCPI surface, driver anchor for a dedicated step.
- [ ] **Rigol MSO5000 / MSO7000 / MSO8000 scopes** — different SCPI dialect than DHO800; new family class under `drivers/rigol/mso/`.
- [ ] **Rigol DP700 / DP800 / DP2000 / DP5000 PSU lines** — profile variants in `drivers/rigol/dp/` once the DP900 dialect is generalized.
- [ ] **Rigol DM3000 / DM6000 DMM families** — profile variants once the DM800 dialect is generalized.
- [ ] **Owon HDS / MSO USB-only variants** — need a TCP/LAN bridge or SKU-specific firmware; gate on community hardware report.

### Driver / simulator follow-ups (discovered in Epic 4)

- [ ] **Tracking generator on Siglent SSA3000X-R** — separate capability object (`ITrackingGenerator`) with output enable + level + frequency tie-in to the SA sweep range.
- [ ] **Scope MSO logic-channel UI** — render the 16 digital lanes on DHO804's MSO option, InfiniiVision MSOX, SDS MSO add-ons; facade already exposes the capability shape in 4.7.
- [ ] **Signal-generator sequence mode** — Keysight 33500B / Rigol DG combined arbitrary sequences and IQ playback; separate capability object.
- [ ] **Keysight Truevolt digitize mode** — explicit sample-and-stream at the instrument's fastest rate, distinct from 2.6c's buffered trend logger.
- [ ] **LXI identification document fetch** — `/lxi/identification` XML overlay enriches the overview card with hostname / manufacturer-declared device class; nice-to-have follow-up.
- [ ] **Simulator record-and-replay** — capture a session against real hardware and replay through the 4.1 framework as a regression fixture.

### Advanced PSU features (extends 2.5)

- [x] **OVP / OCP** — per-channel enable, threshold, trip detect, clear-trip.
- [x] **Tracking** — `:OUTPut:TRACk` to slave CH2 set-values to CH1 without
      combining outputs.
- [x] **Preset memory** — `*SAV` / `*RCL` for saving and recalling full PSU
      state with numbered slots.
- [ ] **Named preset slots** — wrap `:MEMory:STORe` / `:MEMory:LOAD` so
      operators can name snapshots instead of remembering which slot is which.
- [ ] **OVP / OCP delay** — expose `:OUTPut:O[V|C]P:DELay` so fast transients
      don't nuisance-trip protection.

### Advanced DMM features (extends 2.6)

- [ ] **Frequency-measurement aperture** — `:SENSe:FREQuency:APERture` so
      users can trade gate time for measurement precision.
- [ ] **Digitize mode** — explicit sample-and-stream digitizing at the
      instrument's fastest supported rate, distinct from the buffered trend
      logger.
- [ ] **Per-range ACV / ACI bandwidth** — `:SENSe:VOLTage:AC:BANDwidth` to
      pick low / medium / high filter on AC ranges.

### Advanced scope features (extends 2.7)

- [ ] **Pass / fail mask testing** — mask editor overlay on the hero uPlot
      plus the underlying `:MASK:*` SCPI wiring.
- [ ] **Zone trigger** — on-plot region editor with `:TRIGger:ZONE:*`
      plumbing for Rigol DHO800.
- [ ] **Digital / logic channels** — expose the MSO option on DHO804 as
      digital channels in `getChannels`.
- [ ] **Extended trigger kinds on 2.7a** — pattern, duration, delay,
      setup/hold plus the serial-protocol trigger kinds (i2c, spi, uart,
      can, lin). The discriminated-union plumbing is already in place;
      this is a driver + UI subform fan-out.
- [ ] **Full 41-item DHO800 measurement catalog (2.7b)** — expand the
      22-item catalog in `RigolDho800` to the full DHO800 set from the
      programming guide.
- [ ] **Protocol-decoder waterfall (2.7d UI)** — per-protocol
      configuration forms (I²C thresholds, SPI CS polarity / bit order,
      UART baud / parity, CAN sample point, LIN version), virtualised
      packet list with auto-scroll + CSV export, and a waterfall view
      synchronised with the hero uPlot.
- [ ] **NDJSON streaming for `/dmm/logging/samples` and
      `/scope/buses/:id/packets`** — upgrade the current resumable
      `since=<seq>` JSON polls to true chunked NDJSON so very high
      sample/packet rates don't pile up in poll batches.

### Platform

- [ ] **Recording / playback (broad)** — align with Epic 5.4 timeline design; avoid duplicating ad-hoc logging vs orchestration recordings.
