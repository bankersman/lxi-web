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
}

export interface MdnsBrowser {
  on(event: "up", listener: (service: MdnsService) => void): void;
  stop(): void;
}

export interface MdnsFactory {
  find(options: { type: string }): MdnsBrowser;
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
