import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  IMultimeter,
  MultimeterAutoZero,
  MultimeterLoggingConfig,
  MultimeterMathConfig,
  MultimeterMathFunction,
  MultimeterMode,
  MultimeterTemperatureConfig,
  MultimeterTriggerConfig,
  MultimeterTriggerSlope,
  MultimeterTriggerSource,
  TemperatureTransducer,
  TemperatureUnit,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

export async function registerDmmRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const dmm = (
    req: { params: { id: string } },
    reply: FastifyReply,
  ): IMultimeter | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "multimeter") {
      void reply.code(409).send({ error: "session is not a multimeter" });
      return null;
    }
    return facade as IMultimeter;
  };

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/reading",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      return { reading: await d.read() };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/mode",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      return { mode: await d.getMode(), supported: d.supportedModes };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { mode?: MultimeterMode };
  }>("/api/sessions/:id/dmm/mode", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!req.body?.mode) return reply.code(400).send({ error: "mode is required" });
    await d.setMode(req.body.mode);
    return { ok: true };
  });

  // ---- 2.6a ranging + triggering ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/ranging",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.ranging) {
        return { supported: false };
      }
      const state = d.getRange ? await d.getRange() : null;
      const nplc = d.getNplc ? await d.getNplc().catch(() => null) : null;
      return {
        supported: true,
        capability: d.ranging,
        current: state,
        nplc,
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      mode?: MultimeterMode;
      range?: number | "auto";
      nplc?: number;
      autoZero?: MultimeterAutoZero;
    };
  }>("/api/sessions/:id/dmm/ranging", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.ranging) {
      return reply.code(409).send({ error: "ranging is not supported" });
    }
    const body = req.body ?? {};
    if (body.range !== undefined) {
      if (!body.mode) {
        return reply.code(400).send({ error: "mode is required when setting range" });
      }
      if (!d.ranging.modes.includes(body.mode)) {
        return reply.code(400).send({ error: "mode is not supported by ranging" });
      }
      if (body.range !== "auto") {
        const ranges = d.ranging.ranges[body.mode];
        if (ranges && ranges.length > 0) {
          const max = ranges[ranges.length - 1]!.upper;
          if (body.range <= 0 || body.range > max * 1.1) {
            return reply.code(400).send({ error: "range out of bounds" });
          }
        }
      }
      if (!d.setRange) return reply.code(409).send({ error: "setRange not implemented" });
      await d.setRange(body.mode, body.range);
    }
    if (body.nplc !== undefined) {
      if (!d.ranging.nplc.includes(body.nplc)) {
        return reply.code(400).send({ error: "nplc not in capability list" });
      }
      if (!d.setNplc) return reply.code(409).send({ error: "setNplc not implemented" });
      await d.setNplc(body.nplc);
    }
    if (body.autoZero !== undefined) {
      if (!["on", "off", "once"].includes(body.autoZero)) {
        return reply.code(400).send({ error: "invalid autoZero mode" });
      }
      if (!d.setAutoZero) return reply.code(409).send({ error: "setAutoZero not implemented" });
      await d.setAutoZero(body.autoZero);
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/trigger",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.triggering) return { supported: false };
      const config = d.getTriggerConfig ? await d.getTriggerConfig() : null;
      return { supported: true, capability: d.triggering, config };
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      source?: MultimeterTriggerSource;
      slope?: MultimeterTriggerSlope;
      delaySec?: number;
      sampleCount?: number;
    };
  }>("/api/sessions/:id/dmm/trigger", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.triggering || !d.getTriggerConfig || !d.setTriggerConfig) {
      return reply.code(409).send({ error: "triggering is not supported" });
    }
    const current = await d.getTriggerConfig();
    const body = req.body ?? {};
    const next: MultimeterTriggerConfig = {
      source: body.source ?? current.source,
      slope: body.slope ?? current.slope,
      delaySec: body.delaySec ?? current.delaySec,
      sampleCount: body.sampleCount ?? current.sampleCount,
    };
    if (!d.triggering.sources.includes(next.source)) {
      return reply.code(400).send({ error: "source not supported" });
    }
    if (!d.triggering.slopes.includes(next.slope)) {
      return reply.code(400).send({ error: "slope not supported" });
    }
    const s = d.triggering.sampleCountRange;
    if (next.sampleCount < s.min || next.sampleCount > s.max) {
      return reply.code(400).send({ error: "sampleCount out of range" });
    }
    const r = d.triggering.delayRangeSec;
    if (next.delaySec < r.min || next.delaySec > r.max) {
      return reply.code(400).send({ error: "delaySec out of range" });
    }
    await d.setTriggerConfig(next);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/trigger/fire",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.trigger) return reply.code(409).send({ error: "software trigger not supported" });
      await d.trigger();
      return { ok: true };
    },
  );

  // ---- 2.6b math + dual display ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/math",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.math) return { supported: false };
      const state = d.getMath ? await d.getMath() : { config: { function: "none" } };
      return { supported: true, capability: d.math, state };
    },
  );
  app.post<{
    Params: { id: string };
    Body: Partial<MultimeterMathConfig>;
  }>("/api/sessions/:id/dmm/math", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.math || !d.setMath) {
      return reply.code(409).send({ error: "math is not supported" });
    }
    const fn = req.body?.function as MultimeterMathFunction | undefined;
    if (!fn || !d.math.functions.includes(fn)) {
      return reply.code(400).send({ error: "invalid math function" });
    }
    const allowed = d.math.allowedModes[fn];
    if (allowed && fn !== "none") {
      const currentMode = await d.getMode();
      if (!allowed.includes(currentMode)) {
        return reply
          .code(400)
          .send({ error: `math '${fn}' is not allowed in mode '${currentMode}'` });
      }
    }
    if (fn === "dbm" && req.body?.dbmReference !== undefined) {
      if (!d.math.dbmReferences.includes(req.body.dbmReference)) {
        return reply.code(400).send({ error: "dbmReference not in capability" });
      }
    }
    if (
      fn === "limit" &&
      req.body?.limitUpper !== undefined &&
      req.body?.limitLower !== undefined &&
      req.body.limitUpper < req.body.limitLower
    ) {
      return reply.code(400).send({ error: "limitUpper must be >= limitLower" });
    }
    const config: MultimeterMathConfig = {
      function: fn,
      nullOffset: req.body?.nullOffset,
      dbmReference: req.body?.dbmReference,
      limitUpper: req.body?.limitUpper,
      limitLower: req.body?.limitLower,
    };
    await d.setMath(config);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/math/reset",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.resetMathStatistics) {
        return reply.code(409).send({ error: "stats reset not supported" });
      }
      await d.resetMathStatistics();
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/dual",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.dualDisplay) return { supported: false };
      const secondary = d.getDualDisplay ? await d.getDualDisplay() : null;
      return { supported: true, capability: d.dualDisplay, secondary };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { secondary?: MultimeterMode | null };
  }>("/api/sessions/:id/dmm/dual", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.dualDisplay || !d.setDualDisplay) {
      return reply.code(409).send({ error: "dual display is not supported" });
    }
    const secondary = req.body?.secondary ?? null;
    if (secondary !== null) {
      const currentMode = await d.getMode();
      const allowed = d.dualDisplay.pairs[currentMode];
      if (!allowed || !allowed.includes(secondary)) {
        return reply
          .code(400)
          .send({ error: `secondary mode not compatible with primary '${currentMode}'` });
      }
    }
    await d.setDualDisplay(secondary);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/dual/reading",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.readDual) return reply.code(409).send({ error: "dual display read not supported" });
      return { reading: await d.readDual() };
    },
  );

  // ---- 2.6c trend logging + temperature + presets ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/logging",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.logging) return { supported: false };
      const status = d.getLoggingStatus ? await d.getLoggingStatus() : null;
      return { supported: true, capability: d.logging, status };
    },
  );
  app.post<{
    Params: { id: string };
    Body: MultimeterLoggingConfig;
  }>("/api/sessions/:id/dmm/logging/start", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.logging || !d.startLogging) {
      return reply.code(409).send({ error: "logging is not supported" });
    }
    const body = req.body ?? ({} as MultimeterLoggingConfig);
    const intervalMs = Number(body.intervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs < d.logging.minIntervalMs) {
      return reply
        .code(400)
        .send({ error: `intervalMs must be >= ${d.logging.minIntervalMs}` });
    }
    const totalSamples = body.totalSamples;
    if (totalSamples !== undefined) {
      if (!Number.isInteger(totalSamples) || totalSamples < 1) {
        return reply.code(400).send({ error: "totalSamples must be a positive integer" });
      }
      if (totalSamples > d.logging.maxSamples) {
        return reply
          .code(400)
          .send({ error: `totalSamples must be <= ${d.logging.maxSamples}` });
      }
    }
    const run = await d.startLogging({ intervalMs, totalSamples });
    return { ok: true, runId: run.runId };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/logging/stop",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.stopLogging) return reply.code(409).send({ error: "stop not supported" });
      await d.stopLogging();
      return { ok: true };
    },
  );
  app.get<{
    Params: { id: string };
    Querystring: { since?: string; runId?: string };
  }>("/api/sessions/:id/dmm/logging/samples", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.fetchLoggedSamples || !d.getLoggingStatus) {
      return reply.code(409).send({ error: "logging stream not supported" });
    }
    const status = await d.getLoggingStatus();
    if (!status.runId) {
      return { samples: [], runId: null, running: false };
    }
    const since = req.query.since !== undefined ? Number(req.query.since) : undefined;
    const samples = await d.fetchLoggedSamples(status.runId, since);
    return { samples, runId: status.runId, running: status.running };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/temperature",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.temperature) return { supported: false };
      const config = d.getTemperatureConfig ? await d.getTemperatureConfig() : null;
      return { supported: true, capability: d.temperature, config };
    },
  );
  app.post<{
    Params: { id: string };
    Body: MultimeterTemperatureConfig;
  }>("/api/sessions/:id/dmm/temperature", async (req, reply) => {
    const d = dmm(req, reply);
    if (!d) return;
    if (!d.temperature || !d.setTemperatureConfig) {
      return reply.code(409).send({ error: "temperature is not supported" });
    }
    const body = req.body ?? ({} as MultimeterTemperatureConfig);
    if (!d.temperature.units.includes(body.unit as TemperatureUnit)) {
      return reply.code(400).send({ error: "unit not in capability" });
    }
    if (!d.temperature.transducers.includes(body.transducer as TemperatureTransducer)) {
      return reply.code(400).send({ error: "transducer not in capability" });
    }
    await d.setTemperatureConfig(body);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/dmm/presets",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.presets || !d.getPresetCatalog) {
        return { supported: false, slots: 0, occupied: [] as boolean[] };
      }
      const occupied = await d.getPresetCatalog();
      return {
        supported: true,
        slots: d.presets.slots,
        occupied: Array.from(occupied),
      };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/dmm/presets/:slot/save",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.presets || !d.savePreset) {
        return reply.code(409).send({ error: "presets not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= d.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await d.savePreset(slot);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/dmm/presets/:slot/recall",
    async (req, reply) => {
      const d = dmm(req, reply);
      if (!d) return;
      if (!d.presets || !d.recallPreset) {
        return reply.code(409).send({ error: "presets not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= d.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await d.recallPreset(slot);
      return { ok: true };
    },
  );
}
