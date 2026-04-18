import type {
  MultimeterMode,
  MultimeterReading,
  OscilloscopeChannelState,
  PsuChannelState,
  PsuMeasurement,
  PsuPairingMode,
  PsuProtectionKind,
  PsuProtectionState,
  SessionSummary,
  TimebaseState,
} from "@lxi-web/core/browser";

export interface PsuPairingInfo {
  readonly supported: boolean;
  readonly modes: readonly PsuPairingMode[];
  readonly channels: readonly number[];
  readonly mode: PsuPairingMode;
}

export interface PsuTrackingInfo {
  readonly supported: boolean;
  readonly channels: readonly number[];
  readonly enabled: boolean;
}

export interface PsuChannelProtectionInfo {
  readonly channel: number;
  readonly ovp: PsuProtectionState;
  readonly ocp: PsuProtectionState;
}

export interface PsuPresetsInfo {
  readonly supported: boolean;
  readonly slots: number;
  readonly occupied: readonly boolean[];
}

export interface WaveformDto {
  readonly channel: number;
  readonly xIncrement: number;
  readonly xOrigin: number;
  readonly capturedAt: number;
  readonly x: readonly number[];
  readonly y: readonly number[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // not JSON — use raw body
    }
    throw new Error(`${res.status} ${res.statusText}: ${message || "request failed"}`);
  }
  return (await res.json()) as T;
}

export const api = {
  async listSessions(): Promise<SessionSummary[]> {
    const res = await fetch("/api/sessions");
    const body = await parse<{ sessions: SessionSummary[] }>(res);
    return body.sessions;
  },

  async openSession(host: string, port?: number): Promise<SessionSummary> {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ host, port }),
    });
    const body = await parse<{ session: SessionSummary }>(res);
    return body.session;
  },

  async closeSession(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await parse<{ ok: boolean }>(res);
  },

  async sendScpi(
    id: string,
    command: string,
    expectReply?: boolean,
  ): Promise<string | null> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scpi`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ command, expectReply }),
    });
    const body = await parse<{ reply: string | null }>(res);
    return body.reply ?? null;
  },

  async getScopeChannels(id: string): Promise<OscilloscopeChannelState[]> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/channels`);
    const body = await parse<{ channels: OscilloscopeChannelState[] }>(res);
    return body.channels;
  },

  async getScopeTimebase(id: string): Promise<TimebaseState> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/timebase`);
    const body = await parse<{ timebase: TimebaseState }>(res);
    return body.timebase;
  },

  async setScopeTimebase(id: string, settings: Partial<TimebaseState>): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/timebase`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(settings),
    });
    await parse<{ ok: boolean }>(res);
  },

  async setScopeChannelEnabled(
    id: string,
    channel: number,
    enabled: boolean,
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/channels/${channel}/enabled`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      },
    );
    await parse<{ ok: boolean }>(res);
  },

  async singleCapture(id: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/single-capture`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  async readWaveform(id: string, channel: number): Promise<WaveformDto> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/channels/${channel}/waveform`,
    );
    const body = await parse<{ waveform: WaveformDto }>(res);
    return body.waveform;
  },

  async getPsuChannels(id: string): Promise<PsuChannelState[]> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/psu/channels`);
    const body = await parse<{ channels: PsuChannelState[] }>(res);
    return body.channels;
  },

  async setPsuChannel(
    id: string,
    channel: number,
    values: { voltage?: number; current?: number },
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/channels/${channel}`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(values) },
    );
    await parse<{ ok: boolean }>(res);
  },

  async setPsuChannelOutput(
    id: string,
    channel: number,
    enabled: boolean,
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/channels/${channel}/output`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ enabled }),
      },
    );
    await parse<{ ok: boolean }>(res);
  },

  async measurePsuChannel(id: string, channel: number): Promise<PsuMeasurement> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/channels/${channel}/measure`,
    );
    const body = await parse<{ measurement: PsuMeasurement }>(res);
    return body.measurement;
  },

  async getPsuPairing(id: string): Promise<PsuPairingInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/psu/pairing`);
    return parse<PsuPairingInfo>(res);
  },

  async setPsuPairing(id: string, mode: PsuPairingMode): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/psu/pairing`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ mode }),
    });
    await parse<{ ok: boolean }>(res);
  },

  async getPsuTracking(id: string): Promise<PsuTrackingInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/psu/tracking`);
    return parse<PsuTrackingInfo>(res);
  },

  async setPsuTracking(id: string, enabled: boolean): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/psu/tracking`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled }),
    });
    await parse<{ ok: boolean }>(res);
  },

  async getPsuProtection(
    id: string,
    channel: number,
  ): Promise<PsuChannelProtectionInfo> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/channels/${channel}/protection`,
    );
    return parse<PsuChannelProtectionInfo>(res);
  },

  async setPsuProtection(
    id: string,
    channel: number,
    kind: PsuProtectionKind,
    patch: { enabled?: boolean; level?: number },
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/channels/${channel}/protection/${kind}`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(patch) },
    );
    await parse<{ ok: boolean }>(res);
  },

  async clearPsuProtectionTrip(
    id: string,
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/channels/${channel}/protection/${kind}/clear`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  async getPsuPresets(id: string): Promise<PsuPresetsInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/psu/presets`);
    return parse<PsuPresetsInfo>(res);
  },

  async savePsuPreset(id: string, slot: number): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/presets/${slot}/save`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  async recallPsuPreset(id: string, slot: number): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/psu/presets/${slot}/recall`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  async getDmmReading(id: string): Promise<MultimeterReading> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/reading`);
    const body = await parse<{ reading: MultimeterReading }>(res);
    return body.reading;
  },

  async getDmmMode(
    id: string,
  ): Promise<{ mode: MultimeterMode; supported: readonly MultimeterMode[] }> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/mode`);
    return parse<{ mode: MultimeterMode; supported: readonly MultimeterMode[] }>(res);
  },

  async setDmmMode(id: string, mode: MultimeterMode): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/mode`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ mode }),
    });
    await parse<{ ok: boolean }>(res);
  },
};
