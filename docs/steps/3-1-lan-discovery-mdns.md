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

- [ ] Backend exposes a **browse** API (e.g. `GET /api/discovery` or equivalent) that runs **DNS-SD / mDNS** for an **allowlisted** set of service types (start with `_lxi._tcp`, `_scpi._tcp`, `_visa._tcp`; extend as measured on real gear).
- [ ] Response includes enough fields to connect: **host** (or IP), **port** (from SRV), **instance name** / hostname, and **TXT** hints when present; results are **deduped** by host+port.
- [ ] Browse is **on-demand** (user triggers **Scan** in Add-device); optional short **repeat** while the dialog stays open (e.g. every 15–30 s) or a **Refresh** button — not a 24/7 background daemon by default.
- [ ] Add-device dialog: **Scan** populates a **keyboard-operable** list; selecting a row **fills** host/port; user still clicks **Connect** (no silent connects).
- [ ] **Manual** host/port path unchanged; empty scan states and errors are visible (not silent failure).
- [ ] README or step notes document **limitations**: different subnet, VPN, AP client isolation, and corporate firewalls often block mDNS.
- [ ] Accessibility: list and scan control usable with keyboard; new results do not steal focus inappropriately (consider `aria-live` for result count).

## Notes

- VXI-11 and raw port scans are **out of scope** for this step unless explicitly added later; keep the implementation centered on **DNS-SD**.
- Record **observed** `_service._tcp` strings from Rigol (and any second vendor) in this file when verified on hardware.
