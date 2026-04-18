import test from "node:test";
import assert from "node:assert/strict";
import {
  DiscoveryService,
  dedupe,
  type MdnsBrowser,
  type MdnsFactory,
  type MdnsService,
} from "../src/discovery/index.js";
import { buildServer } from "../src/server.js";

interface ScriptedHit {
  readonly type: string;
  readonly service: MdnsService;
  readonly delayMs?: number;
}

function scriptedFactory(hits: readonly ScriptedHit[]): {
  readonly builder: () => MdnsFactory;
  readonly destroyed: { count: number };
} {
  const destroyed = { count: 0 };
  const builder = (): MdnsFactory => {
    const listeners = new Map<string, (service: MdnsService) => void>();
    const timers: NodeJS.Timeout[] = [];

    const factory: MdnsFactory = {
      find({ type }): MdnsBrowser {
        return {
          on(event, listener) {
            if (event === "up") listeners.set(type, listener);
          },
          stop() {},
        };
      },
      destroy() {
        destroyed.count += 1;
        for (const t of timers) clearTimeout(t);
      },
    };

    for (const hit of hits) {
      const fire = (): void => {
        const listener = listeners.get(hit.type);
        listener?.(hit.service);
      };
      if (hit.delayMs && hit.delayMs > 0) {
        timers.push(setTimeout(fire, hit.delayMs));
      } else {
        queueMicrotask(fire);
      }
    }

    return factory;
  };
  return { builder, destroyed };
}

test("dedupe merges the same host across service types and prefers scpi-raw", () => {
  const candidates = dedupe([
    {
      name: "Rigol DHO804 (LXI)",
      type: "lxi",
      host: "rigol-dho804.local",
      port: 80,
      addresses: ["192.168.1.50"],
      txt: { manufacturer: "RIGOL" },
    },
    {
      name: "Rigol DHO804 (SCPI)",
      type: "scpi-raw",
      host: "rigol-dho804.local",
      port: 5025,
      addresses: ["192.168.1.50", "fe80::1"],
      txt: { model: "DHO804" },
    },
  ]);

  assert.equal(candidates.length, 1);
  const [c] = candidates;
  assert.ok(c);
  assert.equal(c.host, "rigol-dho804.local");
  assert.equal(c.port, 5025, "should pick scpi-raw port over lxi/80");
  assert.deepEqual(c.serviceTypes, ["scpi-raw", "lxi"]);
  assert.deepEqual(c.addresses, ["192.168.1.50", "fe80::1"]);
  assert.equal(c.txt.manufacturer, "RIGOL");
  assert.equal(c.txt.model, "DHO804");
});

test("dedupe falls back to lxi port when only lxi is advertised", () => {
  const candidates = dedupe([
    {
      name: "Keysight DSOX (LXI)",
      type: "lxi",
      host: "ksight.local",
      port: 443,
      addresses: ["10.0.0.1"],
      txt: {},
    },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]!.port, 443);
  assert.deepEqual(candidates[0]!.serviceTypes, ["lxi"]);
});

test("dedupe skips entries with no host or invalid port", () => {
  const candidates = dedupe([
    {
      name: "",
      type: "scpi-raw",
      host: "",
      port: 5025,
      addresses: [],
      txt: {},
    },
    {
      name: "missing-port",
      type: "scpi-raw",
      host: "ok.local",
      port: Number.NaN,
      addresses: [],
      txt: {},
    },
  ]);
  assert.equal(candidates.length, 0);
});

test("DiscoveryService.browse collects hits within the timeout and destroys the factory", async () => {
  const { builder, destroyed } = scriptedFactory([
    {
      type: "scpi-raw",
      service: {
        name: "Rigol DP932E",
        type: "scpi-raw",
        host: "dp932e.local",
        port: 5025,
        addresses: ["192.168.1.51"],
        txt: {},
      },
    },
    {
      type: "lxi",
      service: {
        name: "Keysight 34465A",
        type: "lxi",
        host: "ks34465a.local",
        port: 80,
        addresses: ["192.168.1.52"],
        txt: {},
      },
    },
  ]);

  const service = new DiscoveryService({
    defaultTimeoutMs: 100,
    factoryBuilder: builder,
  });
  const result = await service.browse();
  assert.equal(result.candidates.length, 2);
  assert.equal(result.timeoutMs, 100);
  assert.ok(result.serviceTypes.includes("scpi-raw"));
  assert.equal(destroyed.count, 1, "factory is torn down after scan");
});

test("DiscoveryService clamps timeoutMs to the configured maximum", async () => {
  const { builder } = scriptedFactory([]);
  const service = new DiscoveryService({
    defaultTimeoutMs: 50,
    maxTimeoutMs: 200,
    factoryBuilder: builder,
  });
  const result = await service.browse({ timeoutMs: 60_000 });
  assert.equal(result.timeoutMs, 200);
});

test("GET /api/discovery returns deduped candidates from the injected service", async () => {
  const { builder } = scriptedFactory([
    {
      type: "scpi-raw",
      service: {
        name: "Rigol DM858",
        type: "scpi-raw",
        host: "dm858.local",
        port: 5025,
        addresses: ["192.168.1.60"],
        txt: { model: "DM858" },
      },
    },
  ]);
  const discovery = new DiscoveryService({
    defaultTimeoutMs: 60,
    factoryBuilder: builder,
  });
  const app = await buildServer({ logger: false, discovery });

  const res = await app.inject({ method: "GET", url: "/api/discovery" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    candidates: Array<{ host: string; port: number }>;
    timeoutMs: number;
  };
  assert.equal(body.candidates.length, 1);
  assert.equal(body.candidates[0]!.host, "dm858.local");
  assert.equal(body.candidates[0]!.port, 5025);
  assert.equal(body.timeoutMs, 60);

  await app.close();
});

test("GET /api/discovery rejects non-positive timeouts", async () => {
  const { builder } = scriptedFactory([]);
  const discovery = new DiscoveryService({
    defaultTimeoutMs: 60,
    factoryBuilder: builder,
  });
  const app = await buildServer({ logger: false, discovery });
  const res = await app.inject({
    method: "GET",
    url: "/api/discovery?timeoutMs=-1",
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});
