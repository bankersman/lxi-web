import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Guards every public `exports` subpath declared in package.json. If a path
 * is removed, renamed, or the build stops producing the matching artefact,
 * this test fails before the publish workflow even tries to pack.
 *
 * The test imports the real published surface (dist/**) via the package
 * name, relying on pnpm's workspace symlink + the `exports` map — i.e.
 * exactly the path a downstream consumer would hit.
 */

test("root entry exposes façades, DTOs, drivers, and identity helpers", async () => {
  const mod = await import("@lxi-web/core");
  assert.ok(typeof mod === "object" && mod !== null);
  assert.equal(typeof mod.RigolDho800, "function");
  assert.equal(typeof mod.RigolDp900, "function");
  assert.equal(typeof mod.RigolDm858, "function");
  assert.equal(typeof mod.createDefaultRegistry, "function");
  assert.equal(typeof mod.registerRigolDrivers, "function");
  assert.equal(typeof mod.ScpiSession, "function");
  assert.equal(typeof mod.TcpTransport, "function");
  assert.equal(typeof mod.parseIdn, "function");
});

test("./browser entry drops node-only modules", async () => {
  const mod = await import("@lxi-web/core/browser");
  assert.ok(typeof mod === "object" && mod !== null);
  assert.equal(typeof mod.parseIdn, "function");
  assert.equal("TcpTransport" in mod, false);
  assert.equal("ScpiSession" in mod, false);
});

test("./scpi entry exposes the transport + session surface", async () => {
  const mod = await import("@lxi-web/core/scpi");
  assert.equal(typeof mod.ScpiSession, "function");
  assert.equal(typeof mod.TcpTransport, "function");
  assert.equal(typeof mod.ScpiError, "function");
  assert.equal(typeof mod.ScpiTimeoutError, "function");
  assert.equal(typeof mod.ScpiTransportError, "function");
  assert.equal(typeof mod.ScpiProtocolError, "function");
  assert.equal(typeof mod.ScpiClosedError, "function");
});

test("./drivers/rigol entry exposes the bundled Rigol drivers", async () => {
  const mod = await import("@lxi-web/core/drivers/rigol");
  assert.equal(typeof mod.RigolDho800, "function");
  assert.equal(typeof mod.RigolDp900, "function");
  assert.equal(typeof mod.RigolDm858, "function");
  assert.equal(typeof mod.registerRigolDrivers, "function");
});
