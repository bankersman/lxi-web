import test from "node:test";
import assert from "node:assert/strict";
import { Simulator } from "../src/simulator.js";
import {
  ScpiSession,
  createDefaultRegistry,
  parseIdn,
  RigolDho800,
  RigolDp900,
  RigolDm858,
  RigolDl3000,
} from "@lxi-web/core";
import { rigolDho804Personality } from "../personalities/rigol/dho804.js";
import { rigolDp932ePersonality } from "../personalities/rigol/dp932e.js";
import { rigolDm858Personality } from "../personalities/rigol/dm858.js";
import { rigolDl3021Personality } from "../personalities/rigol/dl3021.js";
import { siglentSdl1020xEPersonality } from "../personalities/siglent/sdl1020x-e.js";

async function withSimulator<T>(
  personality: Parameters<typeof rigolDho804Personality extends never ? never : (p: typeof rigolDho804Personality) => void>[0],
  fn: (session: ScpiSession, port: number) => Promise<T>,
): Promise<T> {
  const sim = new Simulator({ personality });
  try {
    await sim.listen({ host: "127.0.0.1", port: 0 });
    const session = await ScpiSession.openTcp({
      host: "127.0.0.1",
      port: sim.port,
      defaultTimeoutMs: 2000,
    });
    try {
      return await fn(session, sim.port);
    } finally {
      await session.close();
    }
  } finally {
    await sim.close();
  }
}

test("pnpm test:sim — ScpiSession connects to DHO804 personality and *IDN?", async () => {
  await withSimulator(rigolDho804Personality, async (session) => {
    const idn = await session.query("*IDN?");
    const parsed = parseIdn(idn);
    assert.equal(parsed.model, "DHO804");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.ok(entry);
    assert.equal(entry!.id, "rigol-dho804");
    const scope = entry!.create(session, parsed) as RigolDho800;
    const timebase = await scope.getTimebase();
    assert.ok(Number.isFinite(timebase.scale));
  });
});

test("pnpm test:sim — ScpiSession connects to DP932E personality + PSU driver", async () => {
  await withSimulator(rigolDp932ePersonality, async (session) => {
    const idn = await session.query("*IDN?");
    const parsed = parseIdn(idn);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "rigol-dp932e");
    const psu = entry!.create(session, parsed) as RigolDp900;
    assert.equal(psu.kind, "powerSupply");
  });
});

test("pnpm test:sim — ScpiSession connects to DM858 personality + DMM driver", async () => {
  await withSimulator(rigolDm858Personality, async (session) => {
    const idn = await session.query("*IDN?");
    const parsed = parseIdn(idn);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "rigol-dm858");
    const dmm = entry!.create(session, parsed) as RigolDm858;
    assert.equal(dmm.kind, "multimeter");
  });
});

test("pnpm test:sim — ScpiSession connects to DL3021 personality + eload driver", async () => {
  await withSimulator(rigolDl3021Personality, async (session) => {
    const idn = await session.query("*IDN?");
    const parsed = parseIdn(idn);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "rigol-dl3021");
    assert.equal(entry?.kind, "electronicLoad");
    const eload = entry!.create(session, parsed) as RigolDl3000;
    assert.equal(eload.kind, "electronicLoad");
    const state = await eload.getState();
    assert.equal(state.mode, "cc");
    await eload.setInputEnabled(true);
    await eload.setSetpoint("cc", 2.0);
    const m = await eload.measure();
    assert.ok(m.current >= 0);
  });
});

test("pnpm test:sim — Siglent SDL1020X-E personality reserves IDN + answers *IDN?", async () => {
  await withSimulator(siglentSdl1020xEPersonality, async (session) => {
    const idn = await session.query("*IDN?");
    const parsed = parseIdn(idn);
    assert.match(parsed.manufacturer, /siglent/i);
    assert.equal(parsed.model, "SDL1020X-E");
    // No driver is registered yet (lands in 4.6); registry returns no entry.
    const registry = createDefaultRegistry();
    assert.equal(registry.resolve(parsed), null);
  });
});

// Hot-swap *IDN? across DHO800 variants against one running simulator
// process to prove the registry + variant table resolve every SKU
// correctly without needing physical hardware.
test("pnpm test:sim — DHO800 family variants all resolve from one simulator", async () => {
  const variants = ["DHO802", "DHO804", "DHO812", "DHO814"];
  const registry = createDefaultRegistry();
  for (const model of variants) {
    const personality = {
      ...rigolDho804Personality,
      idn: `RIGOL TECHNOLOGIES,${model},SN,FW`,
    };
    await withSimulator(personality, async (session) => {
      const parsed = parseIdn(await session.query("*IDN?"));
      assert.equal(parsed.model, model);
      const entry = registry.resolve(parsed);
      assert.ok(entry, `registry must resolve ${model}`);
      assert.equal(entry!.id, `rigol-${model.toLowerCase()}`);
      const scope = entry!.create(session, parsed) as RigolDho800;
      assert.equal(scope.profile.variant, model);
    });
  }
});
