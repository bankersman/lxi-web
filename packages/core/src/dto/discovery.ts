/**
 * LAN-discovery DTOs shared between `@lxi-web/server` (which runs the
 * mDNS / DNS-SD browser) and `@lxi-web/web` (which renders the scan
 * results). Plain interfaces only — no transport-level dependencies.
 */

/**
 * Service types the backend allowlists when browsing mDNS / DNS-SD.
 *
 * The wire form is `_<kind>._tcp.local`; we keep the bare kind here so
 * the same string can round-trip through REST and the web client without
 * leaking underscores or the transport suffix.
 */
export type DiscoveryServiceType =
  | "lxi"
  | "scpi-raw"
  | "hislip"
  | "visa"
  | "other";

/**
 * A deduped, operator-facing discovery result. One entry per LAN
 * hostname; {@link DiscoveryCandidate.serviceTypes} records which
 * service advertisements produced it so the UI can show the match
 * source without duplicate rows per device.
 */
export interface DiscoveryCandidate {
  /** Stable dedup key; the lowercase hostname (usually `<name>.local`). */
  readonly key: string;
  /** Hostname (prefer mDNS `.local`); callable directly by the OS. */
  readonly host: string;
  /**
   * Best SCPI-reachable port, chosen by the server. Preference order:
   * `scpi-raw` → `visa` → `hislip` → `lxi` → first seen.
   */
  readonly port: number;
  /** mDNS instance name, e.g. `"Rigol DHO804 (SCPI)"`. */
  readonly name: string;
  /** Which LXI service kinds matched this host during the scan. */
  readonly serviceTypes: readonly DiscoveryServiceType[];
  /** v4 / v6 IP literals from A / AAAA records, deduped. */
  readonly addresses: readonly string[];
  /** Vendor-supplied TXT record hints (may be empty). */
  readonly txt: Readonly<Record<string, string>>;
}

/** Wire shape of the `GET /api/discovery` response. */
export interface DiscoveryResponse {
  readonly candidates: readonly DiscoveryCandidate[];
  /** Effective timeout the backend waited for advertisements, in ms. */
  readonly timeoutMs: number;
  /** Service types actually browsed this pass. */
  readonly serviceTypes: readonly DiscoveryServiceType[];
  /**
   * Wildcard DNS-SD scan only: how many mDNS `up` events were not
   * `_lxi._tcp` / `_scpi-raw._tcp` / `_hislip` / `_visa`. When present and
   * {@link candidates} is empty, the link had mDNS traffic but no lab
   * instruments advertising those service types.
   */
  readonly nonInstrumentMdnsUps?: number;
}
