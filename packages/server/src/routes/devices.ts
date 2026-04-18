import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  IMultimeter,
  IOscilloscope,
  IPowerSupply,
  MultimeterMode,
  PsuPairingMode,
  PsuProtectionKind,
} from "@lxi-web/core";
import type { SessionManager } from "../sessions/manager.js";

export async function registerDeviceRoutes(
  app: FastifyInstance,
  manager: SessionManager,
): Promise<void> {
  const scope = (req: { params: { id: string } }, reply: FastifyReply): IOscilloscope | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "oscilloscope") {
      void reply.code(409).send({ error: "session is not an oscilloscope" });
      return null;
    }
    return facade as IOscilloscope;
  };
  const psu = (req: { params: { id: string } }, reply: FastifyReply): IPowerSupply | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "powerSupply") {
      void reply.code(409).send({ error: "session is not a power supply" });
      return null;
    }
    return facade as IPowerSupply;
  };
  const dmm = (req: { params: { id: string } }, reply: FastifyReply): IMultimeter | null => {
    const facade = manager.getFacade(req.params.id);
    if (!facade || facade.kind !== "multimeter") {
      void reply.code(409).send({ error: "session is not a multimeter" });
      return null;
    }
    return facade as IMultimeter;
  };

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
    Body: { enabled?: boolean };
  }>(
    "/api/sessions/:id/scope/channels/:channel/enabled",
    async (req, reply) => {
      const s = scope(req, reply);
      if (!s) return;
      await s.setChannelEnabled(Number(req.params.channel), Boolean(req.body?.enabled));
      return { ok: true };
    },
  );
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

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/psu/channels",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      return { channels: await p.getChannels() };
    },
  );
  app.post<{
    Params: { id: string; channel: string };
    Body: { voltage?: number; current?: number };
  }>("/api/sessions/:id/psu/channels/:channel", async (req, reply) => {
    const p = psu(req, reply);
    if (!p) return;
    const ch = Number(req.params.channel);
    if (typeof req.body?.voltage === "number") await p.setChannelVoltage(ch, req.body.voltage);
    if (typeof req.body?.current === "number") await p.setChannelCurrent(ch, req.body.current);
    return { ok: true };
  });
  app.post<{
    Params: { id: string; channel: string };
    Body: { enabled?: boolean };
  }>("/api/sessions/:id/psu/channels/:channel/output", async (req, reply) => {
    const p = psu(req, reply);
    if (!p) return;
    await p.setChannelOutput(Number(req.params.channel), Boolean(req.body?.enabled));
    return { ok: true };
  });
  app.get<{ Params: { id: string; channel: string } }>(
    "/api/sessions/:id/psu/channels/:channel/measure",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      return { measurement: await p.measureChannel(Number(req.params.channel)) };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/psu/pairing",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.pairing || !p.getPairingMode) {
        return { supported: false, modes: [], channels: [], mode: "off" as const };
      }
      return {
        supported: true,
        modes: p.pairing.modes,
        channels: p.pairing.channels,
        mode: await p.getPairingMode(),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { mode?: PsuPairingMode };
  }>("/api/sessions/:id/psu/pairing", async (req, reply) => {
    const p = psu(req, reply);
    if (!p) return;
    if (!p.pairing || !p.setPairingMode) {
      return reply.code(409).send({ error: "pairing is not supported by this PSU" });
    }
    const mode = req.body?.mode;
    if (!mode || !p.pairing.modes.includes(mode)) {
      return reply.code(400).send({ error: "invalid pairing mode" });
    }
    await p.setPairingMode(mode);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/psu/tracking",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.tracking || !p.getTracking) {
        return { supported: false, channels: [], enabled: false };
      }
      return {
        supported: true,
        channels: p.tracking.channels,
        enabled: await p.getTracking(),
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { enabled?: boolean };
  }>("/api/sessions/:id/psu/tracking", async (req, reply) => {
    const p = psu(req, reply);
    if (!p) return;
    if (!p.tracking || !p.setTracking) {
      return reply.code(409).send({ error: "tracking is not supported by this PSU" });
    }
    if (typeof req.body?.enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required" });
    }
    await p.setTracking(req.body.enabled);
    return { ok: true };
  });

  const parseKind = (raw: string): PsuProtectionKind | null =>
    raw === "ovp" || raw === "ocp" ? raw : null;

  app.get<{ Params: { id: string; channel: string } }>(
    "/api/sessions/:id/psu/channels/:channel/protection",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.protection || !p.getProtection) {
        return reply.code(409).send({ error: "protection is not supported by this PSU" });
      }
      const ch = Number(req.params.channel);
      if (!p.protection.channels.includes(ch)) {
        return reply.code(400).send({ error: "channel does not support protection" });
      }
      const [ovp, ocp] = await Promise.all([
        p.getProtection(ch, "ovp"),
        p.getProtection(ch, "ocp"),
      ]);
      return { channel: ch, ovp, ocp };
    },
  );
  app.post<{
    Params: { id: string; channel: string; kind: string };
    Body: { enabled?: boolean; level?: number };
  }>(
    "/api/sessions/:id/psu/channels/:channel/protection/:kind",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.protection) {
        return reply.code(409).send({ error: "protection is not supported by this PSU" });
      }
      const ch = Number(req.params.channel);
      const kind = parseKind(req.params.kind);
      if (!kind) return reply.code(400).send({ error: "kind must be 'ovp' or 'ocp'" });
      if (!p.protection.channels.includes(ch)) {
        return reply.code(400).send({ error: "channel does not support protection" });
      }
      const body = req.body ?? {};
      if (body.level === undefined && body.enabled === undefined) {
        return reply.code(400).send({ error: "enabled or level must be provided" });
      }
      if (typeof body.level === "number") {
        const range = p.protection.ranges[ch]?.[kind];
        if (range && (body.level < range.min || body.level > range.max)) {
          return reply.code(400).send({ error: "level out of range" });
        }
        if (!p.setProtectionLevel) {
          return reply.code(409).send({ error: "setProtectionLevel not supported" });
        }
        await p.setProtectionLevel(ch, kind, body.level);
      }
      if (typeof body.enabled === "boolean") {
        if (!p.setProtectionEnabled) {
          return reply.code(409).send({ error: "setProtectionEnabled not supported" });
        }
        await p.setProtectionEnabled(ch, kind, body.enabled);
      }
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string; channel: string; kind: string } }>(
    "/api/sessions/:id/psu/channels/:channel/protection/:kind/clear",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.protection || !p.clearProtectionTrip) {
        return reply.code(409).send({ error: "protection is not supported by this PSU" });
      }
      const ch = Number(req.params.channel);
      const kind = parseKind(req.params.kind);
      if (!kind) return reply.code(400).send({ error: "kind must be 'ovp' or 'ocp'" });
      if (!p.protection.channels.includes(ch)) {
        return reply.code(400).send({ error: "channel does not support protection" });
      }
      await p.clearProtectionTrip(ch, kind);
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/psu/presets",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.presets || !p.getPresetCatalog) {
        return { supported: false, slots: 0, occupied: [] as boolean[] };
      }
      const occupied = await p.getPresetCatalog();
      return {
        supported: true,
        slots: p.presets.slots,
        occupied: Array.from(occupied),
      };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/psu/presets/:slot/save",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.presets || !p.savePreset) {
        return reply.code(409).send({ error: "presets are not supported by this PSU" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= p.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await p.savePreset(slot);
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string; slot: string } }>(
    "/api/sessions/:id/psu/presets/:slot/recall",
    async (req, reply) => {
      const p = psu(req, reply);
      if (!p) return;
      if (!p.presets || !p.recallPreset) {
        return reply.code(409).send({ error: "presets are not supported by this PSU" });
      }
      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= p.presets.slots) {
        return reply.code(400).send({ error: "slot out of range" });
      }
      await p.recallPreset(slot);
      return { ok: true };
    },
  );

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
}
