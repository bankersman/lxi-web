import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  IOscilloscope,
  OscilloscopeAcquisitionConfig,
  OscilloscopeChannelBandwidthLimit,
  OscilloscopeChannelUnit,
  OscilloscopeCoupling,
  OscilloscopeCursorConfig,
  OscilloscopeDecoderConfig,
  OscilloscopeDisplayPersistence,
  OscilloscopeMathConfig,
  OscilloscopeScreenshotFormat,
  OscilloscopeSweep,
  OscilloscopeTriggerConfig,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

export async function registerScopeRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const scope = (
    req: { params: { id: string } },
    reply: FastifyReply,
  ): IOscilloscope | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "oscilloscope") {
      void reply.code(409).send({ error: "session is not an oscilloscope" });
      return null;
    }
    return facade as IOscilloscope;
  };

  // ---- core channel + timebase (already existed) ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/channels",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      return { channels: await s.getChannels() };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/timebase",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      return { timebase: await s.getTimebase() };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { scale?: number; position?: number };
  }>("/api/sessions/:id/scope/timebase", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    await s.setTimebase(req.body ?? {});
    return { ok: true };
  });
  app.post<{
    Params: { id: string; channel: string };
    Body: {
      enabled?: boolean;
      coupling?: OscilloscopeCoupling;
      scale?: number;
      offset?: number;
      bandwidthLimit?: OscilloscopeChannelBandwidthLimit;
      invert?: boolean;
      unit?: OscilloscopeChannelUnit;
    };
  }>("/api/sessions/:id/scope/channels/:channel", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    const ch = Number(req.params.channel);
    const body = req.body ?? {};
    if (typeof body.enabled === "boolean") await s.setChannelEnabled(ch, body.enabled);
    if (body.coupling && s.setChannelCoupling) await s.setChannelCoupling(ch, body.coupling);
    if (body.scale !== undefined && s.setChannelScale) await s.setChannelScale(ch, body.scale);
    if (body.offset !== undefined && s.setChannelOffset) await s.setChannelOffset(ch, body.offset);
    if (body.bandwidthLimit && s.setChannelBandwidthLimit) {
      await s.setChannelBandwidthLimit(ch, body.bandwidthLimit);
    }
    if (typeof body.invert === "boolean" && s.setChannelInvert) {
      await s.setChannelInvert(ch, body.invert);
    }
    if (body.unit && s.setChannelUnit) await s.setChannelUnit(ch, body.unit);
    return { ok: true };
  });
  app.post<{
    Params: { id: string; channel: string };
    Body: { enabled?: boolean };
  }>("/api/sessions/:id/scope/channels/:channel/enabled", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    await s.setChannelEnabled(Number(req.params.channel), Boolean(req.body?.enabled));
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/single-capture",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      await s.singleCapture();
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string; channel: string } }>(
    "/api/sessions/:id/scope/channels/:channel/waveform",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      const waveform = await s.readWaveform(Number(req.params.channel));
      return {
        waveform: {
          channel: waveform.channel,
          xIncrement: waveform.xIncrement,
          xOrigin: waveform.xOrigin,
          capturedAt: waveform.capturedAt,
          x: Array.from(waveform.x),
          y: Array.from(waveform.y),
        },
      };
    },
  );

  // ---- 2.7a trigger + acquisition ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/trigger",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.trigger) return { supported: false };
      const [config, sweep] = await Promise.all([
        s.getTriggerConfig?.() ?? Promise.resolve(null),
        s.getSweep?.() ?? Promise.resolve("auto" as OscilloscopeSweep),
      ]);
      return { supported: true, capability: s.trigger, config, sweep };
    },
  );
  app.post<{
    Params: { id: string };
    Body: OscilloscopeTriggerConfig;
  }>("/api/sessions/:id/scope/trigger", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.trigger || !s.setTriggerConfig) {
      return reply.code(409).send({ error: "trigger not supported" });
    }
    const body = req.body;
    if (!body || !s.trigger.types.includes(body.type)) {
      return reply.code(400).send({ error: "invalid trigger type" });
    }
    if (body.source && !s.trigger.sources.includes(body.source)) {
      return reply.code(400).send({ error: "invalid trigger source" });
    }
    await s.setTriggerConfig(body);
    return { ok: true };
  });
  app.post<{
    Params: { id: string };
    Body: { mode?: OscilloscopeSweep };
  }>("/api/sessions/:id/scope/trigger/sweep", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.trigger || !s.setSweep) {
      return reply.code(409).send({ error: "sweep not supported" });
    }
    const mode = req.body?.mode;
    if (!mode || !s.trigger.sweepModes.includes(mode)) {
      return reply.code(400).send({ error: "invalid sweep mode" });
    }
    await s.setSweep(mode);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/trigger/force",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.forceTrigger) {
        return reply.code(409).send({ error: "force trigger not supported" });
      }
      await s.forceTrigger();
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/acquisition",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.acquisition) return { supported: false };
      const config = s.getAcquisitionConfig ? await s.getAcquisitionConfig() : null;
      return { supported: true, capability: s.acquisition, config };
    },
  );
  app.post<{
    Params: { id: string };
    Body: OscilloscopeAcquisitionConfig;
  }>("/api/sessions/:id/scope/acquisition", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.acquisition || !s.setAcquisitionConfig) {
      return reply.code(409).send({ error: "acquisition not supported" });
    }
    const body = req.body;
    if (!body) return reply.code(400).send({ error: "body required" });
    if (!s.acquisition.modes.includes(body.mode)) {
      return reply.code(400).send({ error: "invalid acquisition mode" });
    }
    if (!s.acquisition.memoryDepths.includes(body.memoryDepth)) {
      return reply.code(400).send({ error: "invalid memory depth" });
    }
    const r = s.acquisition.averagesRange;
    if (body.mode === "average" && (body.averages < r.min || body.averages > r.max)) {
      return reply.code(400).send({ error: "averages out of range" });
    }
    await s.setAcquisitionConfig(body);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/autoset",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.autoset) return reply.code(409).send({ error: "autoset not supported" });
      await s.autoset();
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/run",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.run) return reply.code(409).send({ error: "run not supported" });
      await s.run();
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/stop",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.stop) return reply.code(409).send({ error: "stop not supported" });
      await s.stop();
      return { ok: true };
    },
  );

  // ---- 2.7b measurements + cursors + math ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/measurements",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.measurements) return { supported: false };
      const results = s.getMeasurements ? await s.getMeasurements() : [];
      return { supported: true, capability: s.measurements, results };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { selections?: { id: string; source: string }[] };
  }>("/api/sessions/:id/scope/measurements", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.measurements || !s.setMeasurements) {
      return reply.code(409).send({ error: "measurements not supported" });
    }
    const sel = req.body?.selections ?? [];
    if (sel.length > s.measurements.maxSelections) {
      return reply
        .code(400)
        .send({ error: `max ${s.measurements.maxSelections} simultaneous measurements` });
    }
    for (const { id, source } of sel) {
      if (!s.measurements.items.some((m) => m.id === id)) {
        return reply.code(400).send({ error: `unknown measurement '${id}'` });
      }
      if (!s.measurements.sources.includes(source)) {
        return reply.code(400).send({ error: `invalid source '${source}'` });
      }
    }
    await s.setMeasurements(sel);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/measurements/clear-stats",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.clearMeasurementStatistics) {
        return reply.code(409).send({ error: "clear-stats not supported" });
      }
      await s.clearMeasurementStatistics();
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/cursors",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.cursors) return { supported: false };
      const state = s.getCursors ? await s.getCursors() : null;
      return { supported: true, capability: s.cursors, state };
    },
  );
  app.post<{
    Params: { id: string };
    Body: OscilloscopeCursorConfig;
  }>("/api/sessions/:id/scope/cursors", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.cursors || !s.setCursors) {
      return reply.code(409).send({ error: "cursors not supported" });
    }
    const body = req.body;
    if (!body || !s.cursors.modes.includes(body.mode)) {
      return reply.code(400).send({ error: "invalid cursor mode" });
    }
    await s.setCursors(body);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/math",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.math) return { supported: false };
      const config = s.getMathConfig ? await s.getMathConfig() : null;
      return { supported: true, capability: s.math, config };
    },
  );
  app.post<{
    Params: { id: string };
    Body: OscilloscopeMathConfig;
  }>("/api/sessions/:id/scope/math", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.math || !s.setMathConfig) {
      return reply.code(409).send({ error: "math not supported" });
    }
    const body = req.body;
    if (!body || !s.math.operators.includes(body.operator)) {
      return reply.code(400).send({ error: "invalid math operator" });
    }
    if (body.operator === "fft" && body.fft && !s.math.fftWindows.includes(body.fft.window)) {
      return reply.code(400).send({ error: "invalid fft window" });
    }
    await s.setMathConfig(body);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/math/waveform",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.readMathWaveform) {
        return reply.code(409).send({ error: "math waveform not supported" });
      }
      const w = await s.readMathWaveform();
      return {
        waveform: {
          channel: w.channel,
          xIncrement: w.xIncrement,
          xOrigin: w.xOrigin,
          capturedAt: w.capturedAt,
          x: Array.from(w.x),
          y: Array.from(w.y),
        },
      };
    },
  );

  // ---- 2.7c references + history + display + presets ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/references",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.references) return { supported: false };
      const slots = s.getReferenceSlots ? await s.getReferenceSlots() : [];
      return { supported: true, capability: s.references, slots };
    },
  );
  app.post<{
    Params: { id: string; slot: string };
    Body: { enabled?: boolean };
  }>("/api/sessions/:id/scope/references/:slot", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.references || !s.setReferenceEnabled) {
      return reply.code(409).send({ error: "references not supported" });
    }
    const slot = Number(req.params.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= s.references.slots) {
      return reply.code(400).send({ error: "slot out of range" });
    }
    if (typeof req.body?.enabled === "boolean") {
      await s.setReferenceEnabled(slot, req.body.enabled);
    }
    return { ok: true };
  });
  app.post<{
    Params: { id: string; slot: string };
    Body: { source?: string };
  }>("/api/sessions/:id/scope/references/:slot/save", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.references || !s.saveReference) {
      return reply.code(409).send({ error: "references not supported" });
    }
    const slot = Number(req.params.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= s.references.slots) {
      return reply.code(400).send({ error: "slot out of range" });
    }
    const source = req.body?.source;
    if (!source) return reply.code(400).send({ error: "source is required" });
    await s.saveReference(slot, source);
    return { ok: true };
  });
  app.get<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/scope/references/:slot/waveform",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.readReferenceWaveform) {
        return reply.code(409).send({ error: "reference waveform not supported" });
      }
      const slot = Number(req.params.slot);
      const w = await s.readReferenceWaveform(slot);
      return {
        waveform: {
          channel: w.channel,
          xIncrement: w.xIncrement,
          xOrigin: w.xOrigin,
          capturedAt: w.capturedAt,
          x: Array.from(w.x),
          y: Array.from(w.y),
        },
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/history",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.history) return { supported: false };
      const state = s.getHistoryState ? await s.getHistoryState() : null;
      return { supported: true, capability: s.history, state };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { enabled?: boolean; frame?: number; playing?: boolean };
  }>("/api/sessions/:id/scope/history", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.history) return reply.code(409).send({ error: "history not supported" });
    const body = req.body ?? {};
    if (typeof body.enabled === "boolean" && s.setHistoryEnabled) {
      await s.setHistoryEnabled(body.enabled);
    }
    if (body.frame !== undefined && s.setHistoryFrame) {
      await s.setHistoryFrame(body.frame);
    }
    if (typeof body.playing === "boolean" && s.setHistoryPlayback) {
      await s.setHistoryPlayback(body.playing);
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/display",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.display) return { supported: false };
      const persistence = s.getDisplayPersistence ? await s.getDisplayPersistence() : null;
      return { supported: true, capability: s.display, persistence };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { persistence?: OscilloscopeDisplayPersistence };
  }>("/api/sessions/:id/scope/display", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.display || !s.setDisplayPersistence) {
      return reply.code(409).send({ error: "display not supported" });
    }
    const p = req.body?.persistence;
    if (!p || !s.display.persistenceOptions.includes(p)) {
      return reply.code(400).send({ error: "invalid persistence" });
    }
    await s.setDisplayPersistence(p);
    return { ok: true };
  });
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/api/sessions/:id/scope/screenshot", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.captureScreenshot || !s.display) {
      return reply.code(409).send({ error: "screenshot not supported" });
    }
    const format = (req.query.format ?? "png") as OscilloscopeScreenshotFormat;
    if (!s.display.screenshotFormats.includes(format)) {
      return reply.code(400).send({ error: "invalid format" });
    }
    const shot = await s.captureScreenshot(format);
    const contentType =
      format === "png" ? "image/png" : format === "jpg" ? "image/jpeg" : "image/bmp";
    void reply.header("Content-Type", contentType);
    void reply.header("Content-Disposition", `inline; filename="scope-${Date.now()}.${format}"`);
    return reply.send(Buffer.from(shot.data));
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/presets",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.presets || !s.getPresetCatalog) {
        return { supported: false, slots: 0, occupied: [] as boolean[] };
      }
      const occupied = await s.getPresetCatalog();
      return { supported: true, slots: s.presets.slots, occupied: Array.from(occupied) };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/scope/presets/:slot/save",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.presets || !s.savePreset) {
        return reply.code(409).send({ error: "presets not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= s.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await s.savePreset(slot);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/scope/presets/:slot/recall",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.presets || !s.recallPreset) {
        return reply.code(409).send({ error: "presets not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= s.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await s.recallPreset(slot);
      return { ok: true };
    },
  );

  // ---- 2.7d protocol decoders ----

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/scope/buses",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      if (!s.decoders) return { supported: false };
      const buses = s.getDecoders ? await s.getDecoders() : [];
      return { supported: true, capability: s.decoders, buses };
    },
  );
  app.post<{
    Params: { id: string; busId: string };
    Body: OscilloscopeDecoderConfig | { config: null };
  }>("/api/sessions/:id/scope/buses/:busId", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.decoders || !s.setDecoder) {
      return reply.code(409).send({ error: "decoders not supported" });
    }
    const busId = Number(req.params.busId);
    if (!Number.isInteger(busId) || busId < 1 || busId > s.decoders.buses) {
      return reply.code(400).send({ error: "busId out of range" });
    }
    const body = req.body as OscilloscopeDecoderConfig | { config: null } | null;
    let config: OscilloscopeDecoderConfig | null = null;
    if (body && "protocol" in body) {
      if (!s.decoders.protocols.includes(body.protocol)) {
        return reply.code(400).send({ error: "protocol not supported" });
      }
      config = body;
    }
    await s.setDecoder(busId, config);
    return { ok: true };
  });
  app.get<{
    Params: { id: string; busId: string };
    Querystring: { since?: string };
  }>("/api/sessions/:id/scope/buses/:busId/packets", async (req, reply) => {
    const s = scope(req, reply);
    if (!s) return;
    if (!s.fetchDecoderPackets || !s.decoders) {
      return reply.code(409).send({ error: "decoder stream not supported" });
    }
    const busId = Number(req.params.busId);
    const since = req.query.since !== undefined ? Number(req.query.since) : undefined;
    const packets = await s.fetchDecoderPackets(busId, since);
    return { packets };
  });
}
