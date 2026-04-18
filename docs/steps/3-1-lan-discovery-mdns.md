# 3.1 — LAN discovery (mDNS / DNS-SD)

## Goal

Let operators **find instruments on the local link** without manually typing IP
addresses, while keeping **explicit user confirmation** before any TCP connection
to lab hardware. Manual **Host** and **Port** entry remains for subnets where
multicast DNS does not propagate.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 3, Version 2 backlog (device auto-discovery).
- Related: Add-device flow from [2-3-vue-dashboard-shell.md](2-3-vue-dashboard-shell.md).

## Acceptance criteria

- [x] Backend exposes a **browse** API (`GET /api/discovery?timeoutMs=<ms>`) that runs **DNS-SD / mDNS** against the allowlisted set `_lxi._tcp`, `_scpi-raw._tcp`, `_hislip._tcp`, `_visa._tcp`.
- [x] Response includes enough fields to connect: **host** (mDNS hostname), **port** (from SRV record, best-match across service types), **name** (instance), **addresses** (A / AAAA), **txt** (record hints), and **serviceTypes** so the UI shows which advertisement produced each row.
- [x] Browse is **on-demand** (the UI's **Scan** button triggers each call). Scans spin up a fresh Bonjour instance, wait for `timeoutMs` (default 3 s, clamped to 50 ms – 15 s), and tear the mDNS factory back down so we never leave a UDP listener pinned. No background daemon.
- [x] Add-device dialog has a **Scan** panel above the manual form: pressing Scan populates a **keyboard-operable** list of candidate buttons; selecting a row **fills** host / port; the user still has to press **Connect**. Results are grouped inside an `aria-live="polite"` region.
- [x] **Manual** host / port path unchanged; empty-scan state and backend errors render inline (not silent).
- [x] Accessibility: the scan panel labels the button with its purpose, uses `aria-live` for result count, and preserves focus on the host field after picking a candidate.
- [x] Limitations documented in the dialog copy and in `docs/user/troubleshooting.md` (different subnet, VPN, AP client isolation, corporate firewalls usually block mDNS).

## Architecture

- **Shared DTOs** live in `@lxi-web/core/dto/discovery.ts` (`DiscoveryServiceType`, `DiscoveryCandidate`, `DiscoveryResponse`) so server and web agree on the wire shape.
- **`DiscoveryService`** (`packages/server/src/discovery/service.ts`) owns the scan lifecycle. It depends only on an injected `MdnsFactoryBuilder`, which makes unit testing trivial: the real builder comes from `createBonjourFactoryBuilder()` (adapts `bonjour-service`), tests pass a scripted fake that emits services synchronously.
- **`dedupe()`** collapses multiple advertisements for the same host into one candidate. Port preference order is `scpi-raw` → `visa` → `hislip` → `lxi` → first seen, so a device that publishes both `_lxi._tcp` (port 80) and `_scpi-raw._tcp` (port 5025) surfaces with 5025 selected by default.
- **REST route**: `GET /api/discovery` (`packages/server/src/routes/discovery.ts`) validates `timeoutMs` and forwards to the service.
- **Web client**: `api.browseDiscovery(timeoutMs?)` fires the REST call; `AddDeviceDialog.vue` owns the UI.

## Notes

- VXI-11 and raw port scans are **out of scope** for this step unless explicitly added later; keep the implementation centered on **DNS-SD**.
- Record **observed** `_service._tcp` strings from Rigol (and any second vendor) here once verified on hardware. Current allowlist is based on common vendor documentation; we'll narrow it when we have real captures.
- `bonjour-service` is **pure JavaScript**, so it works unchanged inside the distroless Docker image from 3.6 — no system libraries, no Avahi daemon required.
- Docker hosts have to join the multicast group on the host network; `docker run --network=host` or an explicit host-mode bridge is the only way mDNS works from the container. Document in `docs/user/installation.md` (3.5).
- **Owon caveat.** Owon XDM / SPE / XDS firmwares frequently do **not** advertise any `_lxi._tcp` / `_scpi-raw._tcp` record at all — Scan will return zero rows even on the same subnet. Those instruments must be added manually, and the SCPI port is **3000** rather than the usual 5025. The `DriverEntry.defaultPort` hint (registry side) carries that number so downstream UI refinements can pre-fill it; today the user types it once. See [4-8-vendor-pack-owon.md](4-8-vendor-pack-owon.md) and the "Scan the LAN is empty" section of [../user/troubleshooting.md](../user/troubleshooting.md) for the full recipe.
