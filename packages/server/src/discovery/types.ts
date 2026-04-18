import type { DiscoveryServiceType } from "@lxi-web/core";

/**
 * Narrow adapter shape the discovery service depends on. The production
 * implementation wraps `bonjour-service`, tests swap in a fake that
 * emits services synchronously so we never touch UDP or the LAN from
 * `node --test`.
 */
export interface MdnsService {
  readonly name: string;
  readonly type: string;
  readonly host: string;
  readonly port: number;
  readonly addresses: readonly string[];
  readonly txt: Readonly<Record<string, string>>;
  /** SRV target name from mDNS, e.g. `Rigol._scpi-raw._tcp.local` — used when `type` is empty or odd. */
  readonly fqdn?: string;
  readonly subtypes?: readonly string[];
}

export interface MdnsBrowser {
  stop(): void;
}

export interface MdnsFactory {
  /**
   * Subscribe to matching services. Implementations must invoke `onUp`
   * **before** starting the underlying browse (see `bonjour-service`
   * `find(opts, onup)`), so early mDNS responses are not dropped.
   */
  find(
    options: { type?: string },
    onUp: (service: MdnsService) => void,
  ): MdnsBrowser;
  destroy(): void;
}

export type MdnsFactoryBuilder = () => MdnsFactory;

/** Bare service-kind strings we browse. Exported for tests. */
export const DEFAULT_SERVICE_TYPES: readonly DiscoveryServiceType[] = [
  "lxi",
  "scpi-raw",
  "hislip",
  "visa",
];
