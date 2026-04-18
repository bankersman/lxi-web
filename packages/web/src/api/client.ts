import type {
  DiscoveryResponse,
  MultimeterAutoZero,
  MultimeterDualDisplayCapability,
  MultimeterDualReading,
  MultimeterLoggingCapability,
  MultimeterLoggingConfig,
  MultimeterLoggingSample,
  MultimeterLoggingStatus,
  MultimeterMathCapability,
  MultimeterMathConfig,
  MultimeterMathState,
  MultimeterMode,
  MultimeterRangeState,
  MultimeterRangingCapability,
  MultimeterReading,
  MultimeterTemperatureCapability,
  MultimeterTemperatureConfig,
  MultimeterTriggerCapability,
  MultimeterTriggerConfig,
  OscilloscopeAcquisitionCapability,
  OscilloscopeAcquisitionConfig,
  OscilloscopeChannelBandwidthLimit,
  OscilloscopeChannelState,
  OscilloscopeChannelUnit,
  OscilloscopeCoupling,
  OscilloscopeCursorCapability,
  OscilloscopeCursorConfig,
  OscilloscopeCursorReadout,
  OscilloscopeDecoderCapability,
  OscilloscopeDecoderConfig,
  OscilloscopeDecoderPacket,
  OscilloscopeDecoderState,
  OscilloscopeDisplayCapability,
  OscilloscopeDisplayPersistence,
  OscilloscopeHistoryCapability,
  OscilloscopeHistoryState,
  OscilloscopeMathCapability,
  OscilloscopeMathConfig,
  OscilloscopeMeasurementCapability,
  OscilloscopeMeasurementResult,
  OscilloscopeReferenceCapability,
  OscilloscopeReferenceSlotState,
  OscilloscopeScreenshotFormat,
  OscilloscopeSweep,
  OscilloscopeTriggerCapability,
  OscilloscopeTriggerConfig,
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

/** Wire shape of the `psu.protection` live topic — one snapshot per session. */
export interface PsuProtectionSnapshot {
  readonly supported: boolean;
  readonly channels: readonly PsuChannelProtectionInfo[];
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

  async reconnectSession(id: string): Promise<SessionSummary> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/reconnect`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    const body = await parse<{ session: SessionSummary }>(res);
    return body.session;
  },

  async browseDiscovery(timeoutMs?: number): Promise<DiscoveryResponse> {
    const url = new URL("/api/discovery", window.location.origin);
    if (timeoutMs !== undefined) url.searchParams.set("timeoutMs", String(timeoutMs));
    const res = await fetch(url.pathname + url.search);
    return parse<DiscoveryResponse>(res);
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

  // ---- 2.6a DMM ranging / triggering ----

  async getDmmRanging(id: string): Promise<DmmRangingInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/ranging`);
    return parse<DmmRangingInfo>(res);
  },
  async setDmmRanging(
    id: string,
    patch: {
      mode?: MultimeterMode;
      range?: number | "auto";
      nplc?: number;
      autoZero?: MultimeterAutoZero;
    },
  ): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/ranging`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    await parse<{ ok: boolean }>(res);
  },
  async getDmmTrigger(id: string): Promise<DmmTriggerInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/trigger`);
    return parse<DmmTriggerInfo>(res);
  },
  async setDmmTrigger(id: string, patch: Partial<MultimeterTriggerConfig>): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/trigger`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    await parse<{ ok: boolean }>(res);
  },
  async fireDmmTrigger(id: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/trigger/fire`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  // ---- 2.6b DMM math / dual display ----

  async getDmmMath(id: string): Promise<DmmMathInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/math`);
    return parse<DmmMathInfo>(res);
  },
  async setDmmMath(id: string, config: MultimeterMathConfig): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/math`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(config),
    });
    await parse<{ ok: boolean }>(res);
  },
  async resetDmmMathStats(id: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/math/reset`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getDmmDualDisplay(id: string): Promise<DmmDualInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/dual`);
    return parse<DmmDualInfo>(res);
  },
  async setDmmDualDisplay(id: string, secondary: MultimeterMode | null): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/dual`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ secondary }),
    });
    await parse<{ ok: boolean }>(res);
  },
  async getDmmDualReading(id: string): Promise<MultimeterDualReading> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/dual/reading`,
    );
    const body = await parse<{ reading: MultimeterDualReading }>(res);
    return body.reading;
  },

  // ---- 2.6c DMM logging / temperature / presets ----

  async getDmmLogging(id: string): Promise<DmmLoggingInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/logging`);
    return parse<DmmLoggingInfo>(res);
  },
  async startDmmLogging(
    id: string,
    config: MultimeterLoggingConfig,
  ): Promise<{ runId: string }> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/logging/start`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(config) },
    );
    const body = await parse<{ ok: boolean; runId: string }>(res);
    return { runId: body.runId };
  },
  async stopDmmLogging(id: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/logging/stop`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getDmmLoggingSamples(
    id: string,
    since?: number,
  ): Promise<{ samples: readonly MultimeterLoggingSample[]; runId: string | null; running: boolean }> {
    const url = new URL(
      `/api/sessions/${encodeURIComponent(id)}/dmm/logging/samples`,
      window.location.origin,
    );
    if (since !== undefined) url.searchParams.set("since", String(since));
    const res = await fetch(url.pathname + url.search);
    return parse(res);
  },
  async getDmmTemperature(id: string): Promise<DmmTemperatureInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/temperature`);
    return parse<DmmTemperatureInfo>(res);
  },
  async setDmmTemperature(id: string, config: MultimeterTemperatureConfig): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/temperature`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(config),
    });
    await parse<{ ok: boolean }>(res);
  },
  async getDmmPresets(id: string): Promise<PresetsInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/dmm/presets`);
    return parse<PresetsInfo>(res);
  },
  async saveDmmPreset(id: string, slot: number): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/presets/${slot}/save`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },
  async recallDmmPreset(id: string, slot: number): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/dmm/presets/${slot}/recall`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  // ---- 2.7a scope channel extras / trigger / acquisition ----

  async setScopeChannel(
    id: string,
    channel: number,
    patch: {
      enabled?: boolean;
      coupling?: OscilloscopeCoupling;
      scale?: number;
      offset?: number;
      bandwidthLimit?: OscilloscopeChannelBandwidthLimit;
      invert?: boolean;
      unit?: OscilloscopeChannelUnit;
    },
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/channels/${channel}`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(patch) },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getScopeTrigger(id: string): Promise<ScopeTriggerInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/trigger`);
    return parse<ScopeTriggerInfo>(res);
  },
  async setScopeTrigger(id: string, config: OscilloscopeTriggerConfig): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/trigger`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(config),
    });
    await parse<{ ok: boolean }>(res);
  },
  async setScopeSweep(id: string, mode: OscilloscopeSweep): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/trigger/sweep`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ mode }) },
    );
    await parse<{ ok: boolean }>(res);
  },
  async forceScopeTrigger(id: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/trigger/force`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getScopeAcquisition(id: string): Promise<ScopeAcquisitionInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/acquisition`);
    return parse<ScopeAcquisitionInfo>(res);
  },
  async setScopeAcquisition(
    id: string,
    config: OscilloscopeAcquisitionConfig,
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/acquisition`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(config) },
    );
    await parse<{ ok: boolean }>(res);
  },
  async scopeAutoset(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/autoset`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });
    await parse<{ ok: boolean }>(res);
  },
  async scopeRun(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/run`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });
    await parse<{ ok: boolean }>(res);
  },
  async scopeStop(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/stop`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });
    await parse<{ ok: boolean }>(res);
  },

  // ---- 2.7b measurements / cursors / math ----

  async getScopeMeasurements(id: string): Promise<ScopeMeasurementsInfo> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/measurements`,
    );
    return parse<ScopeMeasurementsInfo>(res);
  },
  async setScopeMeasurements(
    id: string,
    selections: ReadonlyArray<{ id: string; source: string }>,
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/measurements`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ selections }) },
    );
    await parse<{ ok: boolean }>(res);
  },
  async clearScopeMeasurementStats(id: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/measurements/clear-stats`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getScopeCursors(id: string): Promise<ScopeCursorsInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/cursors`);
    return parse<ScopeCursorsInfo>(res);
  },
  async setScopeCursors(id: string, config: OscilloscopeCursorConfig): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/cursors`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(config),
    });
    await parse<{ ok: boolean }>(res);
  },
  async getScopeMath(id: string): Promise<ScopeMathInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/math`);
    return parse<ScopeMathInfo>(res);
  },
  async setScopeMath(id: string, config: OscilloscopeMathConfig): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/math`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(config),
    });
    await parse<{ ok: boolean }>(res);
  },
  async readScopeMathWaveform(id: string): Promise<WaveformDto> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/math/waveform`,
    );
    const body = await parse<{ waveform: WaveformDto }>(res);
    return body.waveform;
  },

  // ---- 2.7c references / history / display / presets ----

  async getScopeReferences(id: string): Promise<ScopeReferencesInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/references`);
    return parse<ScopeReferencesInfo>(res);
  },
  async setScopeReferenceEnabled(id: string, slot: number, enabled: boolean): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/references/${slot}`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ enabled }) },
    );
    await parse<{ ok: boolean }>(res);
  },
  async saveScopeReference(id: string, slot: number, source: string): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/references/${slot}/save`,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ source }) },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getScopeHistory(id: string): Promise<ScopeHistoryInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/history`);
    return parse<ScopeHistoryInfo>(res);
  },
  async setScopeHistory(
    id: string,
    patch: { enabled?: boolean; frame?: number; playing?: boolean },
  ): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/history`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    await parse<{ ok: boolean }>(res);
  },
  async getScopeDisplay(id: string): Promise<ScopeDisplayInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/display`);
    return parse<ScopeDisplayInfo>(res);
  },
  async setScopeDisplay(
    id: string,
    patch: { persistence?: OscilloscopeDisplayPersistence },
  ): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/display`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    await parse<{ ok: boolean }>(res);
  },
  scopeScreenshotUrl(id: string, format: OscilloscopeScreenshotFormat): string {
    return `/api/sessions/${encodeURIComponent(id)}/scope/screenshot?format=${format}`;
  },
  async getScopePresets(id: string): Promise<PresetsInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/presets`);
    return parse<PresetsInfo>(res);
  },
  async saveScopePreset(id: string, slot: number): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/presets/${slot}/save`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },
  async recallScopePreset(id: string, slot: number): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/presets/${slot}/recall`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
    );
    await parse<{ ok: boolean }>(res);
  },

  // ---- 2.7d decoders ----

  async getScopeBuses(id: string): Promise<ScopeBusesInfo> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/scope/buses`);
    return parse<ScopeBusesInfo>(res);
  },
  async setScopeBus(
    id: string,
    busId: number,
    config: OscilloscopeDecoderConfig | null,
  ): Promise<void> {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(id)}/scope/buses/${busId}`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(config ?? { config: null }),
      },
    );
    await parse<{ ok: boolean }>(res);
  },
  async getScopeBusPackets(
    id: string,
    busId: number,
    since?: number,
  ): Promise<readonly OscilloscopeDecoderPacket[]> {
    const url = new URL(
      `/api/sessions/${encodeURIComponent(id)}/scope/buses/${busId}/packets`,
      window.location.origin,
    );
    if (since !== undefined) url.searchParams.set("since", String(since));
    const res = await fetch(url.pathname + url.search);
    const body = await parse<{ packets: readonly OscilloscopeDecoderPacket[] }>(res);
    return body.packets;
  },
};

// ---- DTO helper types for responses ----

export interface DmmRangingInfo {
  readonly supported: boolean;
  readonly capability?: MultimeterRangingCapability;
  readonly current?: MultimeterRangeState | null;
  readonly nplc?: number | null;
}

export interface DmmTriggerInfo {
  readonly supported: boolean;
  readonly capability?: MultimeterTriggerCapability;
  readonly config?: MultimeterTriggerConfig | null;
}

export interface DmmMathInfo {
  readonly supported: boolean;
  readonly capability?: MultimeterMathCapability;
  readonly state?: MultimeterMathState;
}

export interface DmmDualInfo {
  readonly supported: boolean;
  readonly capability?: MultimeterDualDisplayCapability;
  readonly secondary?: MultimeterMode | null;
}

export interface DmmLoggingInfo {
  readonly supported: boolean;
  readonly capability?: MultimeterLoggingCapability;
  readonly status?: MultimeterLoggingStatus | null;
}

export interface DmmTemperatureInfo {
  readonly supported: boolean;
  readonly capability?: MultimeterTemperatureCapability;
  readonly config?: MultimeterTemperatureConfig | null;
}

export interface PresetsInfo {
  readonly supported: boolean;
  readonly slots: number;
  readonly occupied: readonly boolean[];
}

export interface ScopeTriggerInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeTriggerCapability;
  readonly config?: OscilloscopeTriggerConfig | null;
  readonly sweep?: OscilloscopeSweep;
}

export interface ScopeAcquisitionInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeAcquisitionCapability;
  readonly config?: OscilloscopeAcquisitionConfig | null;
}

export interface ScopeMeasurementsInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeMeasurementCapability;
  readonly results?: readonly OscilloscopeMeasurementResult[];
}

export interface ScopeCursorsInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeCursorCapability;
  readonly state?: {
    readonly config: OscilloscopeCursorConfig;
    readonly readout: OscilloscopeCursorReadout;
  } | null;
}

export interface ScopeMathInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeMathCapability;
  readonly config?: OscilloscopeMathConfig | null;
}

export interface ScopeReferencesInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeReferenceCapability;
  readonly slots?: readonly OscilloscopeReferenceSlotState[];
}

export interface ScopeHistoryInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeHistoryCapability;
  readonly state?: OscilloscopeHistoryState | null;
}

export interface ScopeDisplayInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeDisplayCapability;
  readonly persistence?: OscilloscopeDisplayPersistence | null;
}

export interface ScopeBusesInfo {
  readonly supported: boolean;
  readonly capability?: OscilloscopeDecoderCapability;
  readonly buses?: readonly OscilloscopeDecoderState[];
}
