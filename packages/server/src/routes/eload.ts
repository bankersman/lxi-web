import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  ElectronicLoadBatteryConfig,
  ElectronicLoadDynamicConfig,
  ElectronicLoadMode,
  ElectronicLoadProtectionKind,
  IElectronicLoad,
  MultimeterLoggingConfig,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

const MODES: readonly ElectronicLoadMode[] = ["cc", "cv", "cr", "cp"];
const PROTECTIONS: readonly ElectronicLoadProtectionKind[] = [
  "ovp",
  "ocp",
  "opp",
  "otp",
];

export async function registerEloadRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const eload = (
    req: { params: { id: string } },
    reply: FastifyReply,
  ): IElectronicLoad | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "electronicLoad") {
      void reply.code(409).send({ error: "session is not an electronic load" });
      return null;
    }
    return facade as IElectronicLoad;
  };

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/state",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      return {
        state: await el.getState(),
        limits: el.limits,
        capabilities: {
          protection: el.protection ?? null,
          dynamic: el.dynamic ?? null,
          battery: el.battery ?? null,
          logging: el.logging ?? null,
          presets: el.presets ?? null,
        },
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { enabled?: boolean };
  }>("/api/sessions/:id/eload/enabled", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    if (typeof req.body?.enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required" });
    }
    await el.setInputEnabled(req.body.enabled);
    return { ok: true };
  });

  app.post<{
    Params: { id: string };
    Body: { mode?: ElectronicLoadMode };
  }>("/api/sessions/:id/eload/mode", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    const mode = req.body?.mode;
    if (!mode || !MODES.includes(mode)) {
      return reply.code(400).send({ error: "mode must be cc, cv, cr, or cp" });
    }
    await el.setMode(mode);
    return { ok: true };
  });

  app.post<{
    Params: { id: string };
    Body: { mode?: ElectronicLoadMode; value?: number };
  }>("/api/sessions/:id/eload/setpoint", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    const { mode, value } = req.body ?? {};
    if (!mode || !MODES.includes(mode)) {
      return reply.code(400).send({ error: "mode must be cc, cv, cr, or cp" });
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return reply.code(400).send({ error: "value (number) is required" });
    }
    try {
      await el.setSetpoint(mode, value);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: msg });
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/measure",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      return { measurement: await el.measure() };
    },
  );

  // ---- protection ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/protection",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.protection || !el.getProtection) {
        return { supported: false };
      }
      const getProtection = el.getProtection.bind(el);
      const entries = await Promise.all(
        el.protection.kinds.map(async (kind) => [kind, await getProtection(kind)] as const),
      );
      return {
        supported: true,
        capability: el.protection,
        state: Object.fromEntries(entries),
      };
    },
  );
  app.post<{
    Params: { id: string; kind: string };
    Body: { enabled?: boolean; level?: number };
  }>("/api/sessions/:id/eload/protection/:kind", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    if (!el.protection) {
      return reply.code(409).send({ error: "protection is not supported" });
    }
    const kind = PROTECTIONS.find((k) => k === req.params.kind);
    if (!kind || !el.protection.kinds.includes(kind)) {
      return reply.code(400).send({ error: "unsupported protection kind" });
    }
    const body = req.body ?? {};
    if (body.level === undefined && body.enabled === undefined) {
      return reply.code(400).send({ error: "enabled or level must be provided" });
    }
    try {
      if (typeof body.level === "number") {
        if (!el.setProtectionLevel) {
          return reply.code(409).send({ error: "setProtectionLevel not supported" });
        }
        await el.setProtectionLevel(kind, body.level);
      }
      if (typeof body.enabled === "boolean") {
        if (!el.setProtectionEnabled) {
          return reply.code(409).send({ error: "setProtectionEnabled not supported" });
        }
        await el.setProtectionEnabled(kind, body.enabled);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: msg });
    }
    return { ok: true };
  });
  app.post<{ Params: { id: string; kind: string } }>(
    "/api/sessions/:id/eload/protection/:kind/clear",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.protection || !el.clearProtectionTrip) {
        return reply.code(409).send({ error: "protection is not supported" });
      }
      const kind = PROTECTIONS.find((k) => k === req.params.kind);
      if (!kind || !el.protection.kinds.includes(kind)) {
        return reply.code(400).send({ error: "unsupported protection kind" });
      }
      await el.clearProtectionTrip(kind);
      return { ok: true };
    },
  );

  // ---- dynamic / pulse ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/dynamic",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.dynamic || !el.getDynamicConfig) return { supported: false };
      return {
        supported: true,
        capability: el.dynamic,
        config: await el.getDynamicConfig(),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: ElectronicLoadDynamicConfig;
  }>("/api/sessions/:id/eload/dynamic", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    if (!el.dynamic || !el.setDynamicConfig) {
      return reply.code(409).send({ error: "dynamic mode is not supported" });
    }
    try {
      await el.setDynamicConfig(req.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: msg });
    }
    return { ok: true };
  });

  // ---- battery ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/battery",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.battery || !el.getBatteryState) return { supported: false };
      return {
        supported: true,
        capability: el.battery,
        state: await el.getBatteryState(),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: ElectronicLoadBatteryConfig;
  }>("/api/sessions/:id/eload/battery/start", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    if (!el.battery || !el.startBattery) {
      return reply.code(409).send({ error: "battery mode is not supported" });
    }
    await el.startBattery(req.body);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/battery/stop",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.stopBattery) {
        return reply.code(409).send({ error: "battery mode is not supported" });
      }
      await el.stopBattery();
      return { ok: true };
    },
  );

  // ---- logging ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/logging",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.logging) return { supported: false };
      const status = el.getLoggingStatus ? await el.getLoggingStatus() : null;
      return { supported: true, capability: el.logging, status };
    },
  );
  app.post<{
    Params: { id: string };
    Body: MultimeterLoggingConfig;
  }>("/api/sessions/:id/eload/logging/start", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    if (!el.logging || !el.startLogging) {
      return reply.code(409).send({ error: "logging is not supported" });
    }
    const body = req.body ?? ({} as MultimeterLoggingConfig);
    const intervalMs = Number(body.intervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs < el.logging.minIntervalMs) {
      return reply.code(400).send({
        error: `intervalMs must be >= ${el.logging.minIntervalMs}`,
      });
    }
    const run = await el.startLogging({ intervalMs, totalSamples: body.totalSamples });
    return { ok: true, runId: run.runId };
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/logging/stop",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.stopLogging) {
        return reply.code(409).send({ error: "logging is not supported" });
      }
      await el.stopLogging();
      return { ok: true };
    },
  );
  app.get<{
    Params: { id: string };
    Querystring: { since?: string };
  }>("/api/sessions/:id/eload/logging/samples", async (req, reply) => {
    const el = eload(req, reply);
    if (!el) return;
    if (!el.fetchLoggedSamples || !el.getLoggingStatus) {
      return reply.code(409).send({ error: "logging stream is not supported" });
    }
    const status = await el.getLoggingStatus();
    if (!status.runId) {
      return { samples: [], runId: null, running: false };
    }
    const since = req.query.since !== undefined ? Number(req.query.since) : undefined;
    const samples = await el.fetchLoggedSamples(status.runId, since);
    return { samples, runId: status.runId, running: status.running };
  });

  // ---- presets ----
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/eload/presets",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.presets || !el.getPresetCatalog) {
        return { supported: false, slots: 0, occupied: [] as boolean[] };
      }
      const occupied = await el.getPresetCatalog();
      return {
        supported: true,
        slots: el.presets.slots,
        occupied: Array.from(occupied),
      };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/eload/presets/:slot/save",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.presets || !el.savePreset) {
        return reply.code(409).send({ error: "presets are not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= el.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await el.savePreset(slot);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/eload/presets/:slot/recall",
    async (req, reply) => {
      const el = eload(req, reply);
      if (!el) return;
      if (!el.presets || !el.recallPreset) {
        return reply.code(409).send({ error: "presets are not supported" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= el.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await el.recallPreset(slot);
      return { ok: true };
    },
  );
}
