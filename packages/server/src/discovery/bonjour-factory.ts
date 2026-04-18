import { Bonjour, type Service } from "bonjour-service";
import type { MdnsBrowser, MdnsFactory, MdnsFactoryBuilder } from "./types.js";

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

  find(options: { type: string }): MdnsBrowser {
    const raw = this.#instance.find({ type: options.type });
    const browser: MdnsBrowser = {
      on: (event, listener) => {
        if (event !== "up") return;
        raw.on("up", (service: Service) => {
          listener({
            name: service.name ?? "",
            type: service.type ?? options.type,
            host: service.host ?? "",
            port: service.port ?? 0,
            addresses: service.addresses ?? [],
            txt: (service.txt as Record<string, string> | undefined) ?? {},
          });
        });
      },
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
