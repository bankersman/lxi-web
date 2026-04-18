import type {
  DiscoveryCandidate,
  DiscoveryResponse,
  DiscoveryServiceType,
} from "@lxi-web/core";
import {
  DEFAULT_SERVICE_TYPES,
  type MdnsFactoryBuilder,
  type MdnsService,
} from "./types.js";

export interface DiscoveryServiceOptions {
  /** How long to wait for advertisements before returning. */
  readonly defaultTimeoutMs?: number;
  /** Upper bound on a caller-supplied timeout. Guards against 60s scans. */
  readonly maxTimeoutMs?: number;
  /** Service types to browse on each scan. */
  readonly serviceTypes?: readonly DiscoveryServiceType[];
  /** Injected factory; defaults to `bonjour-service`. */
  readonly factoryBuilder?: MdnsFactoryBuilder;
}

export interface BrowseOptions {
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 15_000;

/**
 * mDNS / DNS-SD scanner. One instance per server; every `browse()` call
 * spins up a fresh browser, waits for `timeoutMs`, and tears the mDNS
 * factory back down so nothing keeps receiving multicast traffic between
 * scans. The deploy target is a solo bench — a continuous background
 * daemon would be more power and more noise than it is worth.
 */
export class DiscoveryService {
  readonly #defaultTimeout: number;
  readonly #maxTimeout: number;
  readonly #serviceTypes: readonly DiscoveryServiceType[];
  readonly #factoryBuilder: MdnsFactoryBuilder;
  /** Only one mDNS browse at a time — parallel `GET /api/discovery` otherwise
   *  spins up overlapping Bonjour stacks and teardown can drop the other's traffic. */
  #browseChain: Promise<void> = Promise.resolve();

  constructor(options: DiscoveryServiceOptions = {}) {
    this.#defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxTimeout = options.maxTimeoutMs ?? MAX_TIMEOUT_MS;
    this.#serviceTypes = options.serviceTypes ?? DEFAULT_SERVICE_TYPES;
    this.#factoryBuilder =
      options.factoryBuilder ??
      (() => {
        throw new Error(
          "DiscoveryService: no mDNS factory configured. " +
            "Pass `factoryBuilder` or use `createBonjourFactoryBuilder()`.",
        );
      });
  }

  get serviceTypes(): readonly DiscoveryServiceType[] {
    return this.#serviceTypes;
  }

  browse(options: BrowseOptions = {}): Promise<DiscoveryResponse> {
    const result = this.#browseChain.then(() => this.#runBrowse(options));
    this.#browseChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #runBrowse(options: BrowseOptions): Promise<DiscoveryResponse> {
    const timeoutMs = clamp(
      options.timeoutMs ?? this.#defaultTimeout,
      50,
      this.#maxTimeout,
    );

    const factory = this.#factoryBuilder();
    const services: MdnsService[] = [];
    let mdnsUpTotal = 0;
    const allowed = new Set<DiscoveryServiceType>(this.#serviceTypes);
    /** One wildcard DNS-SD browser (see `bonjour-service` `find({})`) so a single
     *  `response` pipeline discovers every `_services._dns-sd._udp` PTR and
     *  follow-up queries — avoids four parallel typed browsers on one socket. */
    const browsers = [
      factory.find({}, (service) => {
        mdnsUpTotal += 1;
        const kind = classifyAllowlistedInstrumentKind(service, allowed);
        if (kind === null) return;
        services.push({ ...service, type: kind });
      }),
    ];

    try {
      await delay(timeoutMs);
    } finally {
      for (const browser of browsers) {
        try {
          browser.stop();
        } catch {
          // Swallow: we are already tearing down.
        }
      }
      try {
        factory.destroy();
      } catch {
        // Same.
      }
    }

    const candidates = dedupe(services);
    const nonInstrumentMdnsUps = mdnsUpTotal - services.length;

    return {
      candidates,
      timeoutMs,
      serviceTypes: this.#serviceTypes,
      ...(nonInstrumentMdnsUps > 0 ? { nonInstrumentMdnsUps } : {}),
    };
  }
}

/**
 * Merge raw mDNS hits into a deduped candidate list keyed by hostname.
 * Exported for tests.
 */
export function dedupe(services: readonly MdnsService[]): DiscoveryCandidate[] {
  const byHost = new Map<
    string,
    {
      host: string;
      name: string;
      portByType: Map<DiscoveryServiceType, number>;
      addresses: Set<string>;
      txt: Record<string, string>;
    }
  >();

  for (const svc of services) {
    if (!svc.host || !Number.isInteger(svc.port)) continue;
    const key = svc.host.toLowerCase();
    let entry = byHost.get(key);
    if (!entry) {
      entry = {
        host: svc.host,
        name: svc.name,
        portByType: new Map(),
        addresses: new Set(),
        txt: {},
      };
      byHost.set(key, entry);
    }
    const kind = normalizeDiscoveryServiceType(svc.type);
    if (!entry.portByType.has(kind)) entry.portByType.set(kind, svc.port);
    for (const addr of svc.addresses) entry.addresses.add(addr);
    for (const [k, v] of Object.entries(svc.txt)) {
      if (entry.txt[k] === undefined) entry.txt[k] = v;
    }
  }

  const preference: readonly DiscoveryServiceType[] = [
    "scpi-raw",
    "visa",
    "hislip",
    "lxi",
    "other",
  ];

  return [...byHost.entries()]
    .map(([key, entry]) => {
      const serviceTypes = preference.filter((t) => entry.portByType.has(t));
      const port = pickPort(entry.portByType, preference);
      return {
        key,
        host: entry.host,
        port,
        name: entry.name,
        serviceTypes,
        addresses: [...entry.addresses].sort(),
        txt: entry.txt,
      } satisfies DiscoveryCandidate;
    })
    .sort((a, b) => a.host.localeCompare(b.host));
}

function pickPort(
  ports: Map<DiscoveryServiceType, number>,
  preference: readonly DiscoveryServiceType[],
): number {
  for (const kind of preference) {
    const port = ports.get(kind);
    if (port !== undefined) return port;
  }
  return ports.values().next().value ?? 0;
}

export function normalizeDiscoveryServiceType(type: string): DiscoveryServiceType {
  const clean = type.replace(/^_/, "").replace(/\._tcp.*$/, "").toLowerCase();
  if (clean === "lxi" || clean === "scpi-raw" || clean === "hislip" || clean === "visa") {
    return clean;
  }
  return "other";
}

/**
 * Map `_lxi._tcp` / `_scpi-raw._tcp` / … inside a DNS-SD FQDN when `service.type`
 * from bonjour-service is empty or does not normalize (wildcard browse edge cases).
 */
function instrumentKindFromFqdn(fqdn: string): DiscoveryServiceType | null {
  const lower = fqdn.toLowerCase();
  const m = lower.match(/_((?:scpi-raw)|lxi|hislip|visa)\._tcp/);
  if (!m?.[1]) return null;
  const k = m[1];
  if (k === "lxi" || k === "scpi-raw" || k === "hislip" || k === "visa") return k;
  return null;
}

export function classifyAllowlistedInstrumentKind(
  service: MdnsService,
  allowed: ReadonlySet<DiscoveryServiceType>,
): DiscoveryServiceType | null {
  let kind = normalizeDiscoveryServiceType(service.type);
  if (kind === "other" && service.fqdn) {
    const fromFq = instrumentKindFromFqdn(service.fqdn);
    if (fromFq) kind = fromFq;
  }
  if (kind === "other" && service.subtypes?.length) {
    for (const st of service.subtypes) {
      const k = normalizeDiscoveryServiceType(st);
      if (k !== "other") {
        kind = k;
        break;
      }
    }
  }
  if (kind === "other" || !allowed.has(kind)) return null;
  return kind;
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(value)));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
