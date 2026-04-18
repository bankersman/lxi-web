import { Bonjour, type Service } from "bonjour-service";
import type { MdnsBrowser, MdnsFactory, MdnsFactoryBuilder, MdnsService } from "./types.js";

/**
 * Default mDNS factory backed by `bonjour-service`. Returns a
 * {@link MdnsFactoryBuilder} so each `browse()` invocation can create
 * and tear down its own Bonjour instance rather than leave a UDP
 * listener pinned for the lifetime of the process.
 */
export function createBonjourFactoryBuilder(): MdnsFactoryBuilder {
  return () => new BonjourAdapter();
}

class BonjourAdapter implements MdnsFactory {
  readonly #instance = new Bonjour();
  readonly #browsers: MdnsBrowser[] = [];

  find(options: { type?: string }, onUp: (service: MdnsService) => void): MdnsBrowser {
    const map = (service: Service, fallbackType: string): MdnsService => ({
      name: service.name ?? "",
      type: service.type ?? fallbackType,
      host: service.host ?? "",
      port: service.port ?? 0,
      addresses: service.addresses ?? [],
      txt: (service.txt as Record<string, string> | undefined) ?? {},
      fqdn: service.fqdn,
      subtypes: service.subtypes,
    });
    let raw: ReturnType<Bonjour["find"]>;
    if (options.type !== undefined) {
      const kind = options.type;
      raw = this.#instance.find({ type: kind }, (service: Service) => {
        onUp(map(service, kind));
      });
    } else {
      raw = this.#instance.find(null, (service: Service) => {
        onUp(map(service, ""));
      });
    }
    const browser: MdnsBrowser = {
      stop: () => {
        try {
          raw.stop();
        } catch {
          // bonjour-service throws if already stopped; benign.
        }
      },
    };
    this.#browsers.push(browser);
    return browser;
  }

  destroy(): void {
    for (const b of this.#browsers) {
      try {
        b.stop();
      } catch {
        // already stopped
      }
    }
    try {
      this.#instance.destroy();
    } catch {
      // ditto
    }
  }
}
