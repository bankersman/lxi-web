# @lxi-web/core

Typed SCPI drivers and façades for LXI instruments. The portable core of
[lxi-web](https://github.com/bankersman/lxi-web) — use it without the dashboard
when you want to script instruments from a Node process.

## What you get

- `TcpTransport` + `ScpiSession` — raw TCP SCPI client with `*IDN?`
  parsing, IEEE-488.2 block read, timeouts, and close notifications.
- `IOscilloscope` / `IPowerSupply` / `IMultimeter` — capability-typed
  façades that driver implementations fulfil.
- `parseIdn` + `DriverRegistry` — identify an instrument from its
  `*IDN?` response and route to the right typed driver.
- Bundled Rigol drivers: `RigolDho800`, `RigolDp900`, `RigolDm858`.

## Install

```bash
npm  i @lxi-web/core
pnpm add @lxi-web/core
yarn add @lxi-web/core
```

Requires **Node.js ≥ 24**.

## Minimal usage

```ts
import {
  TcpTransport,
  ScpiSession,
  parseIdn,
  createDefaultRegistry,
} from "@lxi-web/core";

const transport = new TcpTransport({ host: "192.168.1.42", port: 5555 });
await transport.connect();

const session = new ScpiSession(transport);
const idnRaw = await session.query("*IDN?");
const identity = parseIdn(idnRaw);

const registry = createDefaultRegistry();
const match = registry.resolve(identity);
if (!match) {
  console.log("no typed driver, raw SCPI only:", identity);
} else {
  const device = match.create(session, identity);
  console.log("identified", match.id, "—", identity);
  // use `device` as an IOscilloscope / IPowerSupply / IMultimeter.
}

await session.close();
```

## Entry points

- `@lxi-web/core` — everything the dashboard uses server-side.
- `@lxi-web/core/browser` — DTOs, façade types, and identity helpers
  without any Node-only imports.
- `@lxi-web/core/scpi` — transport + session + error types only.
- `@lxi-web/core/drivers/rigol` — the bundled Rigol drivers and their
  registry bootstrap.

Any path under `dist/…` that is **not** in the `exports` map is private
and may change without notice.

## Semver promise

- **Major** bumps for breaking changes in façade interfaces, exports,
  or registry semantics.
- **Minor** bumps for new optional capabilities, new drivers, or new
  subpath entries.
- **Patch** bumps for bug fixes and driver parsing fixes.

## Links

- Repository: <https://github.com/bankersman/lxi-web>
- User manual: <https://bankersman.github.io/lxi-web/>
- Issues & hardware reports:
  <https://github.com/bankersman/lxi-web/issues>

MIT — see the bundled `LICENSE`.
