import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  ISignalGenerator,
  SignalGeneratorBurstConfig,
  SignalGeneratorModulationConfig,
  SignalGeneratorOutputImpedance,
  SignalGeneratorSweepConfig,
  SignalGeneratorWaveform,
  SignalGeneratorWaveformType,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

const WAVEFORM_TYPES: readonly SignalGeneratorWaveformType[] = [
  "sine",
  "square",
  "ramp",
  "pulse",
  "noise",
  "dc",
  "arbitrary",
];
const IMPEDANCES: readonly SignalGeneratorOutputImpedance[] = ["50ohm", "highZ"];

/**
 * Signal-generator route group. Mirrors the shape of the PSU / DMM / eload
 * groups: identity lookup with 409 fall-through when the session kind is
 * wrong, input validation baked into every POST, SCPI errors surfaced as
 * 400s rather than 500s so the UI can show them in a toast.
 */
export async function registerSgRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const sg = (
    req: { params: { id: string } },
    reply: FastifyReply,
  ): ISignalGenerator | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "signalGenerator") {
      void reply.code(409).send({ error: "session is not a signal generator" });
      return null;
    }
    return facade as ISignalGenerator;
  };

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sg/channels",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      return {
        channels: await gen.getChannels(),
        capabilities: {
          modulation: gen.modulation ?? null,
          sweep: gen.sweep ?? null,
          burst: gen.burst ?? null,
          arbitrary: gen.arbitrary ?? null,
          sync: gen.sync ?? null,
          presets: gen.presets ?? null,
        },
      };
    },
  );

  app.get<{ Params: { id: string; ch: string } }>(
    "/api/sessions/:id/sg/channels/:ch",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      const ch = Number(req.params.ch);
      if (!Number.isInteger(ch) || ch < 1) {
        return reply.code(400).send({ error: "channel must be a positive integer" });
      }
      try {
        return { channel: await gen.getChannelState(ch) };
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
    },
  );

  app.post<{
    Params: { id: string; ch: string };
    Body: { enabled?: boolean };
  }>("/api/sessions/:id/sg/channels/:ch/enabled", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    const ch = Number(req.params.ch);
    if (!Number.isInteger(ch) || ch < 1) {
      return reply.code(400).send({ error: "channel must be a positive integer" });
    }
    if (typeof req.body?.enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required" });
    }
    try {
      await gen.setChannelEnabled(ch, req.body.enabled);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.post<{
    Params: { id: string; ch: string };
    Body: { mode?: SignalGeneratorOutputImpedance };
  }>("/api/sessions/:id/sg/channels/:ch/impedance", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    const ch = Number(req.params.ch);
    if (!Number.isInteger(ch) || ch < 1) {
      return reply.code(400).send({ error: "channel must be a positive integer" });
    }
    const mode = req.body?.mode;
    if (!mode || !IMPEDANCES.includes(mode)) {
      return reply.code(400).send({ error: "mode must be '50ohm' or 'highZ'" });
    }
    try {
      await gen.setOutputImpedance(ch, mode);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.post<{
    Params: { id: string; ch: string };
    Body: SignalGeneratorWaveform;
  }>("/api/sessions/:id/sg/channels/:ch/waveform", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    const ch = Number(req.params.ch);
    if (!Number.isInteger(ch) || ch < 1) {
      return reply.code(400).send({ error: "channel must be a positive integer" });
    }
    const config = req.body;
    if (!config || typeof config !== "object" || !WAVEFORM_TYPES.includes(config.type)) {
      return reply.code(400).send({
        error: `waveform type must be one of ${WAVEFORM_TYPES.join(", ")}`,
      });
    }
    try {
      await gen.setWaveform(ch, config);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- modulation ----
  app.get<{ Params: { id: string; ch: string } }>(
    "/api/sessions/:id/sg/channels/:ch/modulation",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.modulation || !gen.getModulation) return { supported: false };
      const ch = Number(req.params.ch);
      return {
        supported: true,
        capability: gen.modulation,
        config: await gen.getModulation(ch),
      };
    },
  );
  app.post<{
    Params: { id: string; ch: string };
    Body: SignalGeneratorModulationConfig;
  }>("/api/sessions/:id/sg/channels/:ch/modulation", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    if (!gen.modulation || !gen.setModulation) {
      return reply.code(409).send({ error: "modulation is not supported" });
    }
    try {
      await gen.setModulation(Number(req.params.ch), req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- sweep ----
  app.get<{ Params: { id: string; ch: string } }>(
    "/api/sessions/:id/sg/channels/:ch/sweep",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.sweep || !gen.getSweep) return { supported: false };
      return {
        supported: true,
        capability: gen.sweep,
        config: await gen.getSweep(Number(req.params.ch)),
      };
    },
  );
  app.post<{
    Params: { id: string; ch: string };
    Body: SignalGeneratorSweepConfig;
  }>("/api/sessions/:id/sg/channels/:ch/sweep", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    if (!gen.sweep || !gen.setSweep) {
      return reply.code(409).send({ error: "sweep is not supported" });
    }
    try {
      await gen.setSweep(Number(req.params.ch), req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- burst ----
  app.get<{ Params: { id: string; ch: string } }>(
    "/api/sessions/:id/sg/channels/:ch/burst",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.burst || !gen.getBurst) return { supported: false };
      return {
        supported: true,
        capability: gen.burst,
        config: await gen.getBurst(Number(req.params.ch)),
      };
    },
  );
  app.post<{
    Params: { id: string; ch: string };
    Body: SignalGeneratorBurstConfig;
  }>("/api/sessions/:id/sg/channels/:ch/burst", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    if (!gen.burst || !gen.setBurst) {
      return reply.code(409).send({ error: "burst is not supported" });
    }
    try {
      await gen.setBurst(Number(req.params.ch), req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- arbitrary waveform ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sg/arbitrary",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.arbitrary) return { supported: false };
      const samples = gen.listArbitrarySamples ? await gen.listArbitrarySamples() : [];
      return { supported: true, capability: gen.arbitrary, samples };
    },
  );
  app.post<{
    Params: { id: string; ch: string };
    Body: { name?: string; samples?: readonly number[] };
  }>("/api/sessions/:id/sg/channels/:ch/arbitrary/upload", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    if (!gen.arbitrary || !gen.uploadArbitrary) {
      return reply.code(409).send({ error: "arbitrary upload not supported" });
    }
    const name = req.body?.name;
    const samplesIn = req.body?.samples;
    if (typeof name !== "string" || name.length === 0) {
      return reply.code(400).send({ error: "name (non-empty string) is required" });
    }
    if (!Array.isArray(samplesIn) || samplesIn.length === 0) {
      return reply.code(400).send({ error: "samples (non-empty number[]) is required" });
    }
    const samples = new Float32Array(samplesIn.length);
    for (let i = 0; i < samplesIn.length; i += 1) {
      samples[i] = Number(samplesIn[i]);
    }
    try {
      const result = await gen.uploadArbitrary(
        Number(req.params.ch),
        name,
        samples,
      );
      return { ok: true, sample: result };
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
  });
  app.delete<{ Params: { id: string; sampleId: string } }>(
    "/api/sessions/:id/sg/arbitrary/:sampleId",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.deleteArbitrary) {
        return reply.code(409).send({ error: "arbitrary delete not supported" });
      }
      await gen.deleteArbitrary(req.params.sampleId);
      return { ok: true };
    },
  );

  // ---- sync ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sg/sync",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.sync || !gen.getSync) return { supported: false };
      return {
        supported: true,
        capability: gen.sync,
        state: await gen.getSync(),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { commonClock?: boolean; alignPhase?: boolean };
  }>("/api/sessions/:id/sg/sync", async (req, reply) => {
    const gen = sg(req, reply);
    if (!gen) return;
    if (!gen.sync) {
      return reply.code(409).send({ error: "sync is not supported" });
    }
    try {
      if (typeof req.body?.commonClock === "boolean" && gen.setCommonClock) {
        await gen.setCommonClock(req.body.commonClock);
      }
      if (req.body?.alignPhase === true && gen.alignPhase) {
        await gen.alignPhase();
      }
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- presets ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sg/presets",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.presets || !gen.getPresetCatalog) {
        return { supported: false, slots: 0, occupied: [] as boolean[] };
      }
      const occupied = await gen.getPresetCatalog();
      return {
        supported: true,
        slots: gen.presets.slots,
        occupied: Array.from(occupied),
      };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/sg/presets/:slot/save",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.presets || !gen.savePreset) {
        return reply.code(409).send({ error: "presets are not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= gen.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await gen.savePreset(slot);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/sg/presets/:slot/recall",
    async (req, reply) => {
      const gen = sg(req, reply);
      if (!gen) return;
      if (!gen.presets || !gen.recallPreset) {
        return reply.code(409).send({ error: "presets are not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= gen.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await gen.recallPreset(slot);
      return { ok: true };
    },
  );
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
