import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  ISpectrumAnalyzer,
  SpectrumAnalyzerAveragingConfig,
  SpectrumAnalyzerBandwidthInput,
  SpectrumAnalyzerChannelPowerConfig,
  SpectrumAnalyzerFrequencyInput,
  SpectrumAnalyzerInputInput,
  SpectrumAnalyzerLimitLine,
  SpectrumAnalyzerMarkerConfig,
  SpectrumAnalyzerSweepInput,
  SpectrumAnalyzerTraceConfig,
  SpectrumAnalyzerTriggerConfig,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

/**
 * Spectrum-analyzer route group. Follows the same shape as `/sg/*`: 409 if
 * the session isn't an SA, 400 for validation failures, 200 for OK. Trace
 * data is serialised to plain arrays over HTTP; clients wanting live traces
 * should subscribe through the WebSocket topic (`sa.trace.<id>`) once that
 * topic is added — kept as a next-step extension.
 */
export async function registerSaRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const sa = (
    req: { params: { id: string } },
    reply: FastifyReply,
  ): ISpectrumAnalyzer | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "spectrumAnalyzer") {
      void reply.code(409).send({ error: "session is not a spectrum analyzer" });
      return null;
    }
    return facade as ISpectrumAnalyzer;
  };

  // ---- overview ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/state",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      const [freq, ref, bw, sweep, input] = await Promise.all([
        inst.getFrequency(),
        inst.getReferenceLevel(),
        inst.getBandwidth(),
        inst.getSweep(),
        inst.getInput(),
      ]);
      return {
        frequency: freq,
        referenceLevel: ref,
        bandwidth: bw,
        sweep,
        input,
        capabilities: {
          traces: inst.traces,
          markers: inst.markers,
          input: inst.input,
          channelPower: inst.channelPower ?? null,
          trigger: inst.trigger ?? null,
          limitLines: inst.limitLines ?? null,
          averaging: inst.averaging ?? null,
          presets: inst.presets ?? null,
          frequencyRangeHz: inst.frequencyRangeHz,
          referenceLevelRangeDbm: inst.referenceLevelRangeDbm,
        },
      };
    },
  );

  // ---- frequency ----
  app.post<{
    Params: { id: string };
    Body: Partial<SpectrumAnalyzerFrequencyInput> & { kind?: string };
  }>("/api/sessions/:id/sa/frequency", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    const body = req.body ?? {};
    if (body.kind !== "centerSpan" && body.kind !== "startStop") {
      return reply
        .code(400)
        .send({ error: "kind must be 'centerSpan' or 'startStop'" });
    }
    try {
      await inst.setFrequency(body as SpectrumAnalyzerFrequencyInput);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- reference level ----
  app.post<{
    Params: { id: string };
    Body: { dbm?: number };
  }>("/api/sessions/:id/sa/reference-level", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    const dbm = req.body?.dbm;
    if (typeof dbm !== "number") {
      return reply.code(400).send({ error: "dbm (number) is required" });
    }
    try {
      await inst.setReferenceLevel(dbm);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- bandwidth / sweep / input ----
  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerBandwidthInput;
  }>("/api/sessions/:id/sa/bandwidth", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    try {
      await inst.setBandwidth(req.body ?? {});
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerSweepInput;
  }>("/api/sessions/:id/sa/sweep", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    try {
      await inst.setSweep(req.body ?? {});
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/single-sweep",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      await inst.singleSweep();
      return { ok: true };
    },
  );

  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerInputInput;
  }>("/api/sessions/:id/sa/input", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    try {
      await inst.setInput(req.body ?? {});
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- traces ----
  app.get<{ Params: { id: string; trace: string } }>(
    "/api/sessions/:id/sa/traces/:trace",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      const tid = Number(req.params.trace);
      if (!Number.isInteger(tid) || tid < 1) {
        return reply.code(400).send({ error: "trace must be a positive integer" });
      }
      try {
        return { config: await inst.getTraceConfig(tid) };
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
    },
  );

  app.post<{
    Params: { id: string; trace: string };
    Body: Partial<Omit<SpectrumAnalyzerTraceConfig, "id">>;
  }>("/api/sessions/:id/sa/traces/:trace", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    const tid = Number(req.params.trace);
    if (!Number.isInteger(tid) || tid < 1) {
      return reply.code(400).send({ error: "trace must be a positive integer" });
    }
    try {
      await inst.setTraceConfig(tid, req.body ?? {});
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string; trace: string } }>(
    "/api/sessions/:id/sa/traces/:trace/data",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      const tid = Number(req.params.trace);
      if (!Number.isInteger(tid) || tid < 1) {
        return reply.code(400).send({ error: "trace must be a positive integer" });
      }
      try {
        const data = await inst.readTrace(tid);
        return {
          id: data.id,
          points: data.points,
          unit: data.unit,
          timestamp: data.timestamp,
          frequencyHz: Array.from(data.frequencyHz),
          amplitude: Array.from(data.amplitude),
        };
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
    },
  );

  // ---- markers ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/markers",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      return { markers: await inst.listMarkers() };
    },
  );

  app.post<{
    Params: { id: string; marker: string };
    Body: SpectrumAnalyzerMarkerConfig;
  }>("/api/sessions/:id/sa/markers/:marker", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    const mid = Number(req.params.marker);
    if (!Number.isInteger(mid) || mid < 1) {
      return reply.code(400).send({ error: "marker must be a positive integer" });
    }
    try {
      await inst.setMarker(mid, req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string; marker: string } }>(
    "/api/sessions/:id/sa/markers/:marker/peak-search",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.peakSearch) {
        return reply.code(409).send({ error: "peakSearch not supported" });
      }
      const mid = Number(req.params.marker);
      try {
        return { reading: await inst.peakSearch(mid) };
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
    },
  );

  // ---- channel power ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/channel-power",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.channelPower || !inst.getChannelPower) {
        return { supported: false };
      }
      return {
        supported: true,
        capability: inst.channelPower,
        config: await inst.getChannelPower(),
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerChannelPowerConfig;
  }>("/api/sessions/:id/sa/channel-power", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    if (!inst.setChannelPower) {
      return reply.code(409).send({ error: "channel power not supported" });
    }
    try {
      await inst.setChannelPower(req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/channel-power/reading",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.readChannelPower) {
        return reply.code(409).send({ error: "channel power not supported" });
      }
      try {
        return { reading: await inst.readChannelPower() };
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
    },
  );

  // ---- trigger ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/trigger",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.trigger || !inst.getTrigger) return { supported: false };
      return {
        supported: true,
        capability: inst.trigger,
        config: await inst.getTrigger(),
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerTriggerConfig;
  }>("/api/sessions/:id/sa/trigger", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    if (!inst.setTrigger) {
      return reply.code(409).send({ error: "trigger is not supported" });
    }
    try {
      await inst.setTrigger(req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- limit lines ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/limit-lines",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.limitLines || !inst.listLimitLines) return { supported: false };
      return {
        supported: true,
        capability: inst.limitLines,
        lines: await inst.listLimitLines(),
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerLimitLine;
  }>("/api/sessions/:id/sa/limit-lines", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    if (!inst.setLimitLine) {
      return reply.code(409).send({ error: "limit lines not supported" });
    }
    try {
      await inst.setLimitLine(req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  app.delete<{ Params: { id: string; lineId: string } }>(
    "/api/sessions/:id/sa/limit-lines/:lineId",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.deleteLimitLine) {
        return reply.code(409).send({ error: "limit lines not supported" });
      }
      await inst.deleteLimitLine(Number(req.params.lineId));
      return { ok: true };
    },
  );

  // ---- averaging ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/averaging",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.averaging || !inst.getAveraging) return { supported: false };
      return {
        supported: true,
        capability: inst.averaging,
        config: await inst.getAveraging(),
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: SpectrumAnalyzerAveragingConfig;
  }>("/api/sessions/:id/sa/averaging", async (req, reply) => {
    const inst = sa(req, reply);
    if (!inst) return;
    if (!inst.setAveraging) {
      return reply.code(409).send({ error: "averaging not supported" });
    }
    try {
      await inst.setAveraging(req.body);
    } catch (err) {
      return reply.code(400).send({ error: toMessage(err) });
    }
    return { ok: true };
  });

  // ---- presets ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/sa/presets",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.presets || !inst.getPresetCatalog) {
        return { supported: false, slots: 0, occupied: [] as boolean[] };
      }
      return {
        supported: true,
        slots: inst.presets.slots,
        occupied: Array.from(await inst.getPresetCatalog()),
      };
    },
  );

  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/sa/presets/:slot/save",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.savePreset) {
        return reply.code(409).send({ error: "presets not supported" });
      }
      const slot = Number(req.params.slot);
      try {
        await inst.savePreset(slot);
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/sa/presets/:slot/recall",
    async (req, reply) => {
      const inst = sa(req, reply);
      if (!inst) return;
      if (!inst.recallPreset) {
        return reply.code(409).send({ error: "presets not supported" });
      }
      const slot = Number(req.params.slot);
      try {
        await inst.recallPreset(slot);
      } catch (err) {
        return reply.code(400).send({ error: toMessage(err) });
      }
      return { ok: true };
    },
  );
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
