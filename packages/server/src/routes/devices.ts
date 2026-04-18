import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  IMultimeter,
  IOscilloscope,
  IPowerSupply,
  MultimeterMode,
  PsuPairingMode,
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
