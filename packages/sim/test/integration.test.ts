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
  RigolDg900,
  SiglentSsa3000x,
  SiglentSpd,
  SiglentSdm,
  SiglentSdsHd,
  SiglentSdl,
  SiglentSdg,
} from "@lxi-web/core";
import { rigolDho804Personality } from "../personalities/rigol/dho804.js";
import { rigolDp932ePersonality } from "../personalities/rigol/dp932e.js";
import { rigolDm858Personality } from "../personalities/rigol/dm858.js";
import { rigolDl3021Personality } from "../personalities/rigol/dl3021.js";
import { rigolDg812Personality } from "../personalities/rigol/dg812.js";
import { rigolDg932Personality } from "../personalities/rigol/dg932.js";
import { siglentSpd3303xEPersonality } from "../personalities/siglent/spd3303x-e.js";
import { siglentSdm3065xPersonality } from "../personalities/siglent/sdm3065x.js";
import { siglentSds824xHdPersonality } from "../personalities/siglent/sds824x-hd.js";
import { siglentSdl1020xEPersonality } from "../personalities/siglent/sdl1020x-e.js";
import { siglentSdg2042xPersonality } from "../personalities/siglent/sdg2042x.js";
import { siglentSsa3032xPersonality } from "../personalities/siglent/ssa3032x.js";
import { keysight33511bPersonality } from "../personalities/keysight/33511b.js";
import { keysightEdu36311aPersonality } from "../personalities/keysight/edu36311a.js";
import { keysightTruevolt34461aPersonality } from "../personalities/keysight/truevolt-34461a.js";
import { keysightInfiniivisionDsox2024aPersonality } from "../personalities/keysight/infiniivision-dsox2024a.js";
import { keysightInfiniivisionDsox3034tPersonality } from "../personalities/keysight/infiniivision-dsox3034t.js";
import { keysightEl34243aPersonality } from "../personalities/keysight/el34243a.js";
import { owonXdm2041Personality } from "../personalities/owon/xdm2041.js";
import { owonXdm1041Personality } from "../personalities/owon/xdm1041.js";
import { owonSpe3103Personality } from "../personalities/owon/spe3103.js";
import { owonXds3104aePersonality } from "../personalities/owon/xds3104ae.js";
import { tektronixTbs2102bPersonality } from "../personalities/tektronix/tbs2102b.js";
import { tektronixMso54Personality } from "../personalities/tektronix/mso54.js";
import { tektronixAfg31102Personality } from "../personalities/tektronix/afg31102.js";
import { tektronixPws4323Personality } from "../personalities/tektronix/pws4323.js";
import type {
  KeysightE36,
  KeysightTrueVolt,
  KeysightInfiniiVision,
  KeysightEl3,
  KeysightTrueform33500,
  OwonXdm,
  OwonSpe,
  OwonXds,
  TektronixTbs,
  TektronixMso,
  TektronixAfg,
  TektronixPws,
} from "@lxi-web/core";

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

test("pnpm test:sim — ScpiSession connects to SDL1020X-E personality + eload driver", async () => {
  await withSimulator(siglentSdl1020xEPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SDL1020X-E");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "siglent-sdl1020x-e");
    assert.equal(entry?.kind, "electronicLoad");
    const eload = entry!.create(session, parsed) as SiglentSdl;
    const state = await eload.getState();
    assert.equal(state.mode, "cc");
    await eload.setInputEnabled(true);
    await eload.setSetpoint("cc", 1.5);
    const m = await eload.measure();
    assert.ok(m.current >= 0);
  });
});

test("pnpm test:sim — ScpiSession connects to DG812 personality + SG driver", async () => {
  await withSimulator(rigolDg812Personality, async (session) => {
    const idn = await session.query("*IDN?");
    const parsed = parseIdn(idn);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "rigol-dg812");
    assert.equal(entry?.kind, "signalGenerator");
    const sg = entry!.create(session, parsed) as RigolDg900;
    assert.equal(sg.kind, "signalGenerator");
    // Round-trip a waveform: set, then read back.
    await sg.setWaveform(1, {
      type: "sine",
      frequencyHz: 12_345,
      amplitudeVpp: 2.5,
      offsetV: 0.1,
    });
    const state = await sg.getChannelState(1);
    assert.equal(state.waveform.type, "sine");
    assert.equal(Math.round(state.actual.frequencyHz), 12_345);
  });
});

test("pnpm test:sim — DG932 clamps requested frequency to the profile ceiling", async () => {
  await withSimulator(rigolDg932Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "rigol-dg932");
    const sg = entry!.create(session, parsed) as RigolDg900;
    // 35 MHz is the DG932 ceiling; the driver refuses a 40 MHz request.
    await assert.rejects(
      async () =>
        sg.setWaveform(1, {
          type: "sine",
          frequencyHz: 40_000_000,
          amplitudeVpp: 1,
          offsetV: 0,
        }),
      /frequency/i,
    );
    // Within bounds still works.
    await sg.setWaveform(1, {
      type: "square",
      frequencyHz: 1_000_000,
      amplitudeVpp: 1,
      offsetV: 0,
      dutyPct: 25,
    });
    const state = await sg.getChannelState(1);
    assert.equal(state.waveform.type, "square");
  });
});

test("pnpm test:sim — ScpiSession connects to SDG2042X personality + SG driver", async () => {
  await withSimulator(siglentSdg2042xPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SDG2042X");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "siglent-sdg2042x");
    assert.equal(entry?.kind, "signalGenerator");
    const sg = entry!.create(session, parsed) as SiglentSdg;
    await sg.setWaveform(1, {
      type: "sine",
      frequencyHz: 5_000,
      amplitudeVpp: 2,
      offsetV: 0.25,
    });
    const state = await sg.getChannelState(1);
    assert.equal(state.waveform.type, "sine");
    assert.equal(Math.round(state.actual.frequencyHz), 5_000);
  });
});

test("pnpm test:sim — ScpiSession connects to SPD3303X-E personality + PSU driver", async () => {
  await withSimulator(siglentSpd3303xEPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SPD3303X-E");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "siglent-spd3303x-e");
    assert.equal(entry?.kind, "powerSupply");
    const psu = entry!.create(session, parsed) as SiglentSpd;
    await psu.setChannelVoltage(1, 3.3);
    await psu.setChannelCurrent(1, 0.5);
    await psu.setChannelOutput(1, true);
    const channels = await psu.getChannels();
    assert.equal(channels.length, 3);
    const ch1 = channels[0]!;
    assert.equal(ch1.setVoltage, 3.3);
    assert.equal(ch1.output, true);
  });
});

test("pnpm test:sim — ScpiSession connects to SDM3065X personality + DMM driver", async () => {
  await withSimulator(siglentSdm3065xPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SDM3065X");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "siglent-sdm3065x");
    assert.equal(entry?.kind, "multimeter");
    const dmm = entry!.create(session, parsed) as SiglentSdm;
    const mode = await dmm.getMode();
    assert.ok(typeof mode === "string");
    const reading = await dmm.read();
    assert.ok(Number.isFinite(reading.value));
  });
});

test("pnpm test:sim — ScpiSession connects to SDS824X-HD personality + scope driver", async () => {
  await withSimulator(siglentSds824xHdPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SDS824X HD");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.kind, "oscilloscope");
    const scope = entry!.create(session, parsed) as SiglentSdsHd;
    const timebase = await scope.getTimebase();
    assert.ok(Number.isFinite(timebase.scale));
    await scope.setChannelEnabled(1, true);
    const channels = await scope.getChannels();
    assert.ok(channels.length >= 2);
    const waveform = await scope.readWaveform(1);
    assert.ok(waveform.y.length > 0);
  });
});

test("pnpm test:sim — ScpiSession connects to SSA3032X personality + SA driver", async () => {
  await withSimulator(siglentSsa3032xPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SSA3032X-R");
    assert.match(parsed.manufacturer, /siglent/i);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "siglent-ssa3032x-r");
    assert.equal(entry?.kind, "spectrumAnalyzer");
    const sa = entry!.create(session, parsed) as SiglentSsa3000x;
    // Round-trip: set center + span, read back, fetch one trace.
    await sa.setFrequency({ kind: "centerSpan", centerHz: 1e9, spanHz: 2e7 });
    await sa.setReferenceLevel(-10);
    const freq = await sa.getFrequency();
    assert.equal(freq.centerHz, 1e9);
    assert.equal(freq.spanHz, 2e7);
    const ref = await sa.getReferenceLevel();
    assert.equal(ref.dbm, -10);
    await sa.setSweep({ pointsN: 201 });
    const sweep = await sa.getSweep();
    assert.equal(sweep.pointsN, 201);
    const trace = await sa.readTrace(1);
    assert.equal(trace.id, 1);
    assert.equal(trace.unit, "dBm");
    assert.ok(trace.points >= 1);
    assert.equal(trace.frequencyHz.length, trace.amplitude.length);
  });
});

test("pnpm test:sim — SSA3032X driver refuses frequency above profile ceiling", async () => {
  await withSimulator(siglentSsa3032xPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    const sa = entry!.create(session, parsed) as SiglentSsa3000x;
    await assert.rejects(
      async () =>
        sa.setFrequency({ kind: "centerSpan", centerHz: 10e9, spanHz: 1e6 }),
      /frequency/i,
    );
  });
});

test("pnpm test:sim — Keysight 33511B personality + SG driver round-trips waveform config", async () => {
  await withSimulator(keysight33511bPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.match(parsed.manufacturer, /keysight/i);
    assert.equal(parsed.model, "33511B");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "keysight-33511b");
    assert.equal(entry?.kind, "signalGenerator");
    const sg = entry!.create(session, parsed) as KeysightTrueform33500;
    await sg.setWaveform(1, {
      type: "sine",
      frequencyHz: 2_500,
      amplitudeVpp: 0.5,
      offsetV: 0,
    });
    const state = await sg.getChannelState(1);
    assert.equal(state.waveform.type, "sine");
    assert.equal(Math.round(state.actual.frequencyHz), 2_500);
    await sg.setChannelEnabled(1, true);
    const again = await sg.getChannelState(1);
    assert.equal(again.enabled, true);
  });
});

test("pnpm test:sim — Keysight EDU36311A personality + PSU driver round-trips channel state", async () => {
  await withSimulator(keysightEdu36311aPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "EDU36311A");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "keysight-edu36311a");
    assert.equal(entry?.kind, "powerSupply");
    const psu = entry!.create(session, parsed) as KeysightE36;
    await psu.setChannelVoltage(1, 3.3);
    await psu.setChannelCurrent(1, 0.5);
    await psu.setChannelOutput(1, true);
    const channels = await psu.getChannels();
    assert.equal(channels.length, 3);
    const ch1 = channels.find((c) => c.id === 1)!;
    assert.equal(ch1.setVoltage, 3.3);
    assert.equal(ch1.output, true);
    // Pairing surface exists (CH2/CH3 series/parallel on EDU36311A).
    assert.ok(psu.pairing);
    await psu.setPairingMode("series");
    assert.equal(await psu.getPairingMode(), "series");
  });
});

test("pnpm test:sim — Keysight Truevolt 34461A personality + DMM driver reads mode + value", async () => {
  await withSimulator(keysightTruevolt34461aPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "34461A");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "keysight-34461a");
    assert.equal(entry?.kind, "multimeter");
    const dmm = entry!.create(session, parsed) as KeysightTrueVolt;
    await dmm.setMode("dcVoltage");
    assert.equal(await dmm.getMode(), "dcVoltage");
    const reading = await dmm.read();
    assert.ok(Number.isFinite(reading.value));
    assert.equal(reading.mode, "dcVoltage");
    await dmm.setRange("dcVoltage", 10);
    const range = await dmm.getRange();
    assert.equal(range.mode, "dcVoltage");
  });
});

test("pnpm test:sim — Keysight InfiniiVision DSOX2024A personality + scope driver decodes a waveform", async () => {
  await withSimulator(keysightInfiniivisionDsox2024aPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.match(parsed.model, /DSO.?X ?2024A/i);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "keysight-dsox2024a");
    assert.equal(entry?.kind, "oscilloscope");
    const scope = entry!.create(session, parsed) as KeysightInfiniiVision;
    const timebase = await scope.getTimebase();
    assert.ok(Number.isFinite(timebase.scale));
    await scope.setChannelEnabled(1, true);
    const channels = await scope.getChannels();
    assert.equal(channels.length, 4);
    const waveform = await scope.readWaveform(1);
    assert.ok(waveform.y.length > 0);
  });
});

test("pnpm test:sim — Keysight InfiniiVision DSOX3034T accepts dashed IDN + resolves correctly", async () => {
  await withSimulator(keysightInfiniivisionDsox3034tPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    // Real firmware emits `DSO-X 3034T`; the resolver must tolerate it.
    assert.match(parsed.model, /DSO-X\s3034T/i);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "keysight-dsox3034t");
  });
});

test("pnpm test:sim — Keysight EL34243A personality + eload driver round-trips setpoints", async () => {
  await withSimulator(keysightEl34243aPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "EL34243A");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "keysight-el34243a");
    assert.equal(entry?.kind, "electronicLoad");
    const eload = entry!.create(session, parsed) as KeysightEl3;
    await eload.setMode("cc");
    await eload.setInputEnabled(true);
    await eload.setSetpoint("cc", 2.0);
    const state = await eload.getState();
    assert.equal(state.enabled, true);
    assert.equal(state.mode, "cc");
    assert.equal(state.setpoints.cc, 2.0);
    const m = await eload.measure();
    assert.ok(m.current >= 0);
  });
});

test("pnpm test:sim — Owon XDM2041 personality + DMM driver reads mode + value", async () => {
  await withSimulator(owonXdm2041Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "XDM2041");
    assert.match(parsed.manufacturer, /owon/i);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "owon-xdm2041");
    assert.equal(entry?.kind, "multimeter");
    assert.equal(entry?.defaultPort, 3000);
    const dmm = entry!.create(session, parsed) as OwonXdm;
    await dmm.setMode("dcVoltage");
    assert.equal(await dmm.getMode(), "dcVoltage");
    const reading = await dmm.read();
    assert.ok(Number.isFinite(reading.value));
    assert.equal(reading.mode, "dcVoltage");
    assert.equal(reading.unit, "V");
    // XDM2041 is the 5½-digit profile — 4-wire is available.
    assert.ok(dmm.supportedModes.includes("fourWireResistance"));
    // Preset capability is advertised because the profile carries slots.
    assert.ok(dmm.presets);
  });
});

test("pnpm test:sim — Owon XDM1041 resolves via empty-manufacturer fallback", async () => {
  await withSimulator(owonXdm1041Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    // Fixture exercises the blank-manufacturer quirk.
    assert.equal(parsed.manufacturer, "");
    assert.equal(parsed.model, "XDM1041");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.ok(entry, "XDM1041 must resolve despite empty manufacturer");
    assert.equal(entry!.kind, "multimeter");
    assert.equal(entry!.defaultPort, 3000);
    const dmm = entry!.create(session, parsed) as OwonXdm;
    // XDM1041 is the 4½-digit profile — 4-wire is absent.
    assert.ok(!dmm.supportedModes.includes("fourWireResistance"));
    // No preset capability on the 4½-digit variant.
    assert.equal(dmm.presets, undefined);
    const reading = await dmm.read();
    assert.ok(Number.isFinite(reading.value));
  });
});

test("pnpm test:sim — Owon SPE3103 personality + PSU driver round-trips channel state", async () => {
  await withSimulator(owonSpe3103Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "SPE3103");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "owon-spe3103");
    assert.equal(entry?.kind, "powerSupply");
    assert.equal(entry?.defaultPort, 3000);
    const psu = entry!.create(session, parsed) as OwonSpe;
    await psu.setChannelVoltage(1, 5.0);
    await psu.setChannelCurrent(1, 0.5);
    await psu.setChannelOutput(1, true);
    const channels = await psu.getChannels();
    assert.equal(channels.length, 3);
    const ch1 = channels.find((c) => c.id === 1)!;
    assert.equal(ch1.setVoltage, 5);
    assert.equal(ch1.output, true);
    // SPE does not advertise pairing / tracking / protection / presets.
    assert.equal(psu.pairing, undefined);
    assert.equal(psu.tracking, undefined);
    assert.equal(psu.presets, undefined);
  });
});

test("pnpm test:sim — Owon XDS3104AE personality + scope resolves via Lilliput manufacturer", async () => {
  await withSimulator(owonXds3104aePersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "XDS3104AE");
    // IDN deliberately advertises Lilliput (Owon parent).
    assert.match(parsed.manufacturer, /lilliput/i);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "owon-xds3104ae");
    assert.equal(entry?.kind, "oscilloscope");
    assert.equal(entry?.defaultPort, 3000);
    const scope = entry!.create(session, parsed) as OwonXds;
    const timebase = await scope.getTimebase();
    assert.ok(Number.isFinite(timebase.scale));
    await scope.setChannelEnabled(1, true);
    const channels = await scope.getChannels();
    assert.equal(channels.length, 4);
    const waveform = await scope.readWaveform(1);
    assert.ok(waveform.y.length > 0);
    // Decoders / references / history / math are intentionally absent.
    assert.equal(scope.display, undefined);
    // Advanced trigger types are deliberately not advertised.
    assert.deepEqual(scope.trigger.types, ["edge"]);
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

test("pnpm test:sim — Tektronix TBS2102B personality + TBS scope driver round-trips core commands", async () => {
  await withSimulator(tektronixTbs2102bPersonality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "TBS2102B");
    assert.match(parsed.manufacturer, /tektronix/i);
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "tektronix-tbs2102b");
    assert.equal(entry?.kind, "oscilloscope");
    const scope = entry!.create(session, parsed) as TektronixTbs;
    const timebase = await scope.getTimebase();
    assert.ok(Number.isFinite(timebase.scale));
    await scope.setChannelEnabled(1, true);
    const channels = await scope.getChannels();
    assert.equal(channels.length, 2);
    const waveform = await scope.readWaveform(1);
    assert.ok(waveform.y.length > 0, "ASCII CURVE? path must decode samples");
    assert.deepEqual(scope.trigger.types, ["edge"]);
  });
});

test("pnpm test:sim — Tektronix MSO54 personality + MSO scope driver decodes binary waveform", async () => {
  await withSimulator(tektronixMso54Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "MSO54");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "tektronix-mso54");
    const scope = entry!.create(session, parsed) as TektronixMso;
    await scope.setChannelEnabled(1, true);
    const channels = await scope.getChannels();
    assert.equal(channels.length, 4);
    const waveform = await scope.readWaveform(1);
    assert.ok(waveform.y.length > 0, "WFMOutpre? + CURVe? binary path must decode samples");
    assert.equal(scope.profile.sampleWidth, 2);
  });
});

test("pnpm test:sim — Tektronix AFG31102 personality + AFG driver round-trips waveform config", async () => {
  await withSimulator(tektronixAfg31102Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "AFG31102");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "tektronix-afg31102");
    assert.equal(entry?.kind, "signalGenerator");
    const afg = entry!.create(session, parsed) as TektronixAfg;
    await afg.setChannelEnabled(1, true);
    await afg.setWaveform(1, {
      type: "sine",
      frequencyHz: 1_000_000,
      amplitudeVpp: 2,
      offsetV: 0,
    });
    const status = await afg.getChannelStatus(1);
    assert.equal(status.frequencyHz, 1_000_000);
    assert.equal(status.amplitudeVpp, 2);
    const state = await afg.getChannelState(1);
    assert.equal(state.enabled, true);
    assert.equal(state.waveform.type, "sine");
  });
});

test("pnpm test:sim — Tektronix PWS4323 personality + PWS driver drives 3 independent rails", async () => {
  await withSimulator(tektronixPws4323Personality, async (session) => {
    const parsed = parseIdn(await session.query("*IDN?"));
    assert.equal(parsed.model, "PWS4323");
    const registry = createDefaultRegistry();
    const entry = registry.resolve(parsed);
    assert.equal(entry?.id, "tektronix-pws4323");
    assert.equal(entry?.kind, "powerSupply");
    const psu = entry!.create(session, parsed) as TektronixPws;
    const channels = await psu.getChannels();
    assert.equal(channels.length, 3);
    await psu.setChannelVoltage(1, 5);
    await psu.setChannelCurrent(1, 0.5);
    await psu.setChannelOutput(1, true);
    const meas = await psu.measureChannel(1);
    assert.ok(meas.voltage > 0, "PWS should report non-zero voltage when output is on");
    assert.equal(meas.channel, 1);
  });
});
