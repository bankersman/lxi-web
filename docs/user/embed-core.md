# Embed the core drivers

`@lxi-web/core` is the portable half of lxi-web — the SCPI transport,
session, typed façades, and Rigol drivers — packaged for direct
consumption from Node. Use it when you want to script instruments from
your own process **without** running the dashboard.

## When to use `@lxi-web/core` vs the Docker image

You probably want **`@lxi-web/core`** if:

- You already run a Node process at the bench.
- You want to automate SCPI from CI, a test harness, or a CLI tool.
- You want to embed the drivers in a different UI you already have.

You probably want the **[Docker image](./installation.md)** if:

- You want a browser dashboard with live readouts and no extra code.
- You want someone else to handle the REST / WebSocket / SPA glue.
- You want mDNS discovery, session persistence, and the device matrix
  out of the box.

Both ship from the same tag and the same sources.

## Install

```bash
npm  i @lxi-web/core
pnpm add @lxi-web/core
yarn add @lxi-web/core
```

Requires Node ≥ 24, ESM-only, TypeScript types included.

## Connect and query

```ts
import { TcpTransport, ScpiSession } from "@lxi-web/core";

const transport = new TcpTransport({ host: "192.168.1.42", port: 5555 });
await transport.connect();

const session = new ScpiSession(transport);
console.log(await session.query("*IDN?"));

await session.close();
```

## Route to a typed façade

```ts
import {
  TcpTransport,
  ScpiSession,
  parseIdn,
  createDefaultRegistry,
  RigolDho800,
} from "@lxi-web/core";

const registry = createDefaultRegistry();
const transport = new TcpTransport({ host: "192.168.1.42", port: 5555 });
await transport.connect();

const session = new ScpiSession(transport);
const identity = parseIdn(await session.query("*IDN?"));
const match = registry.resolve(identity);
if (!match) {
  console.log("fallback to raw SCPI", identity);
} else if (match.kind === "oscilloscope") {
  const scope = match.create(session, identity) as RigolDho800;
  await scope.setTimebaseScale(1e-3);
}

await session.close();
```

## Stable surface

The published `exports` map pins the shape of the library:

- `@lxi-web/core` — everything above.
- `@lxi-web/core/browser` — DTOs and façade types without Node imports,
  so the same types are shareable between server + browser code.
- `@lxi-web/core/scpi` — just the transport + session + error types.
- `@lxi-web/core/drivers/rigol` — driver classes + registry bootstrap.

Anything under `dist/…` that is not in this list is private and may
change in a patch release.

## Semver

- Major: breaking change in façade interfaces, exports, or registry
  semantics.
- Minor: new optional capabilities, new drivers, new subpath entries.
- Patch: bug and driver parsing fixes.

Pre-releases publish to the `next` dist-tag; `pnpm add @lxi-web/core@next`
opts in.

## Report your hardware

If you run `@lxi-web/core` against an instrument we do not ship a driver
for, consider filing a
[hardware report](https://github.com/bankersman/lxi-web/issues/new?template=instrument-report.yml).
A report is enough for us to add a pattern entry to the registry so the
same `*IDN?` routes you to the right façade next release.
