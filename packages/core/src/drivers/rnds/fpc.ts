import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  ISpectrumAnalyzer,
  SpectrumAnalyzerAmplitudeUnit,
  SpectrumAnalyzerAveragingCapability,
  SpectrumAnalyzerBandwidthInput,
  SpectrumAnalyzerBandwidthState,
  SpectrumAnalyzerFrequencyInput,
  SpectrumAnalyzerFrequencyState,
  SpectrumAnalyzerInputCapability,
  SpectrumAnalyzerInputInput,
  SpectrumAnalyzerInputState,
  SpectrumAnalyzerMarkerCapability,
  SpectrumAnalyzerMarkerConfig,
  SpectrumAnalyzerMarkerReading,
  SpectrumAnalyzerMarkerType,
  SpectrumAnalyzerReferenceLevel,
  SpectrumAnalyzerSweepInput,
  SpectrumAnalyzerSweepState,
  SpectrumAnalyzerTraceCapability,
  SpectrumAnalyzerTraceConfig,
  SpectrumAnalyzerTraceData,
  SpectrumAnalyzerTraceDetector,
  SpectrumAnalyzerTraceMode,
} from "../../facades/spectrum-analyzer.js";
import type { InstrumentPresetCapability } from "../../facades/multimeter.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import { type FpcProfile, FPC_DEFAULT } from "./fpc-profile.js";

const TRACE_MODES: readonly SpectrumAnalyzerTraceMode[] = [
  "clearWrite",
  "maxHold",
  "minHold",
  "average",
  "view",
];
const TRACE_DETECTORS: readonly SpectrumAnalyzerTraceDetector[] = [
  "peak",
  "sample",
  "rms",
  "negPeak",
  "average",
];
const MARKER_TYPES: readonly SpectrumAnalyzerMarkerType[] = ["normal", "delta", "peak"];
const UNITS: readonly SpectrumAnalyzerAmplitudeUnit[] = ["dBm", "dBmV", "dBuV", "V", "W"];

/**
 * R&S FPC / FPL / HMS spectrum-analyzer driver.
 *
 * Covers only the frequency / bandwidth / reference / trace surface
 * — enough to plug into the 4.5 SA façade. Channel power, limit
 * lines, averaging, and trigger surfaces are reachable via SCPI but
 * deferred to a follow-up once a real-hardware field report lands.
 *
 * SCPI tree matches the R&S FSW manual's SAN application:
 *   - `SENSe:FREQuency:CENTer`, `:SPAN`, `:STARt`, `:STOP`
 *   - `DISPlay:WINDow:TRACe:Y:SCALe:RLEVel`
 *   - `SENSe:BANDwidth:RESolution` / `:VIDeo` with `:AUTO`
 *   - `INITiate:CONTinuous`, `INITiate:IMMediate`
 *   - `TRACe:DATA? TRACE<n>`, `TRACe<n>:MODE`, `DETector`
 *   - `CALCulate:MARKer<n>:X|Y`, `:MAXimum`
 */
export class RndsFpc implements ISpectrumAnalyzer {
  readonly kind = "spectrumAnalyzer" as const;
  readonly profile: FpcProfile;
  readonly traces: SpectrumAnalyzerTraceCapability;
  readonly input: SpectrumAnalyzerInputCapability;
  readonly markers: SpectrumAnalyzerMarkerCapability;
  readonly frequencyRangeHz: { readonly min: number; readonly max: number };
  readonly referenceLevelRangeDbm: { readonly min: number; readonly max: number };
  readonly averaging: SpectrumAnalyzerAveragingCapability;
  readonly presets: InstrumentPresetCapability;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: FpcProfile = FPC_DEFAULT,
  ) {
    this.profile = profile;
    this.frequencyRangeHz = {
      min: profile.frequencyMinHz,
      max: profile.frequencyMaxHz,
    };
    this.referenceLevelRangeDbm = {
      min: profile.referenceLevelMinDbm,
      max: profile.referenceLevelMaxDbm,
    };
    this.traces = {
      traceCount: profile.traceCount,
      modes: TRACE_MODES,
      detectors: TRACE_DETECTORS,
      units: UNITS,
    };
    this.input = {
      attenuationRangeDb: profile.attenuationRangeDb,
      preamp: profile.preampFreqRangeHz
        ? { available: true, freqRangeHz: profile.preampFreqRangeHz }
        : { available: false },
      inputImpedances: [50],
    };
    this.markers = { count: profile.markerCount, types: MARKER_TYPES };
    this.averaging = {
      modes: ["logPower", "power", "voltage"],
      countRange: { min: 1, max: 1000 },
    };
    this.presets = { slots: profile.presetSlots };
  }

  async getFrequency(): Promise<SpectrumAnalyzerFrequencyState> {
    const [centerRaw, spanRaw, startRaw, stopRaw] = await Promise.all([
      safeQuery(this.port, "SENSe:FREQuency:CENTer?"),
      safeQuery(this.port, "SENSe:FREQuency:SPAN?"),
      safeQuery(this.port, "SENSe:FREQuency:STARt?"),
      safeQuery(this.port, "SENSe:FREQuency:STOP?"),
    ]);
    return {
      centerHz: parseNumberOrZero(centerRaw),
      spanHz: parseNumberOrZero(spanRaw),
      startHz: parseNumberOrZero(startRaw),
      stopHz: parseNumberOrZero(stopRaw),
    };
  }

  async setFrequency(input: SpectrumAnalyzerFrequencyInput): Promise<void> {
    if (input.kind === "centerSpan") {
      this.#assertFrequency(input.centerHz - input.spanHz / 2, "start");
      this.#assertFrequency(input.centerHz + input.spanHz / 2, "stop");
      await this.port.write(`SENSe:FREQuency:CENTer ${input.centerHz}`);
      await this.port.write(`SENSe:FREQuency:SPAN ${input.spanHz}`);
      return;
    }
    if (input.stopHz <= input.startHz) {
      throw new RangeError("stopHz must be greater than startHz");
    }
    this.#assertFrequency(input.startHz, "start");
    this.#assertFrequency(input.stopHz, "stop");
    await this.port.write(`SENSe:FREQuency:STARt ${input.startHz}`);
    await this.port.write(`SENSe:FREQuency:STOP ${input.stopHz}`);
  }

  async getReferenceLevel(): Promise<SpectrumAnalyzerReferenceLevel> {
    const raw = await safeQuery(
      this.port,
      "DISPlay:WINDow:TRACe:Y:SCALe:RLEVel?",
    );
    return { dbm: parseNumberOrZero(raw) };
  }

  async setReferenceLevel(dbm: number): Promise<void> {
    if (
      !Number.isFinite(dbm) ||
      dbm < this.referenceLevelRangeDbm.min ||
      dbm > this.referenceLevelRangeDbm.max
    ) {
      throw new RangeError(
        `reference level ${dbm} dBm outside ${this.referenceLevelRangeDbm.min}..${this.referenceLevelRangeDbm.max}`,
      );
    }
    await this.port.write(`DISPlay:WINDow:TRACe:Y:SCALe:RLEVel ${dbm}`);
  }

  async getBandwidth(): Promise<SpectrumAnalyzerBandwidthState> {
    const [rbwRaw, vbwRaw, autoRbwRaw, autoVbwRaw] = await Promise.all([
      safeQuery(this.port, "SENSe:BANDwidth:RESolution?"),
      safeQuery(this.port, "SENSe:BANDwidth:VIDeo?"),
      safeQuery(this.port, "SENSe:BANDwidth:RESolution:AUTO?"),
      safeQuery(this.port, "SENSe:BANDwidth:VIDeo:AUTO?"),
    ]);
    return {
      rbwHz: parseNumberOrZero(rbwRaw),
      vbwHz: parseNumberOrZero(vbwRaw),
      autoRbw: parseBool(autoRbwRaw),
      autoVbw: parseBool(autoVbwRaw),
    };
  }

  async setBandwidth(input: SpectrumAnalyzerBandwidthInput): Promise<void> {
    if (typeof input.autoRbw === "boolean") {
      await this.port.write(
        `SENSe:BANDwidth:RESolution:AUTO ${input.autoRbw ? "ON" : "OFF"}`,
      );
    }
    if (typeof input.autoVbw === "boolean") {
      await this.port.write(
        `SENSe:BANDwidth:VIDeo:AUTO ${input.autoVbw ? "ON" : "OFF"}`,
      );
    }
    if (typeof input.rbwHz === "number" && input.rbwHz > 0) {
      await this.port.write(`SENSe:BANDwidth:RESolution ${input.rbwHz}`);
    }
    if (typeof input.vbwHz === "number" && input.vbwHz > 0) {
      await this.port.write(`SENSe:BANDwidth:VIDeo ${input.vbwHz}`);
    }
  }

  async getSweep(): Promise<SpectrumAnalyzerSweepState> {
    const [pointsRaw, timeRaw, contRaw] = await Promise.all([
      safeQuery(this.port, "SENSe:SWEep:POINts?"),
      safeQuery(this.port, "SENSe:SWEep:TIME?"),
      safeQuery(this.port, "INITiate:CONTinuous?"),
    ]);
    return {
      pointsN: Math.max(1, Math.round(parseNumberOrZero(pointsRaw))),
      timeSec: parseNumberOrZero(timeRaw),
      continuous: parseBool(contRaw),
    };
  }

  async setSweep(input: SpectrumAnalyzerSweepInput): Promise<void> {
    if (typeof input.pointsN === "number") {
      await this.port.write(`SENSe:SWEep:POINts ${input.pointsN}`);
    }
    if (typeof input.timeSec === "number" && input.timeSec > 0) {
      await this.port.write(`SENSe:SWEep:TIME ${input.timeSec}`);
    }
    if (typeof input.continuous === "boolean") {
      await this.port.write(
        `INITiate:CONTinuous ${input.continuous ? "ON" : "OFF"}`,
      );
    }
  }

  async singleSweep(): Promise<void> {
    await this.port.write("INITiate:IMMediate");
  }

  async getTraceConfig(traceId: number): Promise<SpectrumAnalyzerTraceConfig> {
    this.#assertTrace(traceId);
    const [modeRaw, detRaw, stateRaw] = await Promise.all([
      safeQuery(this.port, `DISPlay:WINDow:TRACe${traceId}:MODE?`),
      safeQuery(this.port, `SENSe:DETector${traceId}:FUNCtion?`),
      safeQuery(this.port, `DISPlay:WINDow:TRACe${traceId}:STATe?`),
    ]);
    return {
      id: traceId,
      mode: decodeTraceMode(modeRaw),
      detector: decodeDetector(detRaw),
      enabled: parseBool(stateRaw),
    };
  }

  async setTraceConfig(
    traceId: number,
    config: Partial<Omit<SpectrumAnalyzerTraceConfig, "id">>,
  ): Promise<void> {
    this.#assertTrace(traceId);
    if (config.mode) {
      await this.port.write(
        `DISPlay:WINDow:TRACe${traceId}:MODE ${encodeTraceMode(config.mode)}`,
      );
    }
    if (config.detector) {
      await this.port.write(
        `SENSe:DETector${traceId}:FUNCtion ${encodeDetector(config.detector)}`,
      );
    }
    if (typeof config.enabled === "boolean") {
      await this.port.write(
        `DISPlay:WINDow:TRACe${traceId}:STATe ${config.enabled ? "ON" : "OFF"}`,
      );
    }
  }

  async readTrace(traceId: number): Promise<SpectrumAnalyzerTraceData> {
    this.#assertTrace(traceId);
    const [freq, ampRaw] = await Promise.all([
      this.getFrequency(),
      this.port.query(`TRACe:DATA? TRACE${traceId}`, { timeoutMs: 10_000 }),
    ]);
    const amplitude = parseCsvFloat64(ampRaw);
    const points = amplitude.length;
    const frequencyHz = new Float64Array(points);
    if (points > 1) {
      const step = (freq.stopHz - freq.startHz) / (points - 1);
      for (let i = 0; i < points; i += 1) {
        frequencyHz[i] = freq.startHz + step * i;
      }
    } else if (points === 1) {
      frequencyHz[0] = freq.centerHz;
    }
    return {
      id: traceId,
      points,
      unit: "dBm",
      frequencyHz,
      amplitude,
      timestamp: Date.now(),
    };
  }

  async getInput(): Promise<SpectrumAnalyzerInputState> {
    const [attRaw, autoRaw, preampRaw] = await Promise.all([
      safeQuery(this.port, "INPut:ATTenuation?"),
      safeQuery(this.port, "INPut:ATTenuation:AUTO?"),
      this.input.preamp.available
        ? safeQuery(this.port, "INPut:GAIN:STATe?")
        : Promise.resolve("0"),
    ]);
    return {
      attenuationDb: parseNumberOrZero(attRaw),
      autoAttenuation: parseBool(autoRaw),
      preampEnabled: parseBool(preampRaw),
      inputImpedanceOhm: 50,
    };
  }

  async setInput(input: SpectrumAnalyzerInputInput): Promise<void> {
    if (typeof input.autoAttenuation === "boolean") {
      await this.port.write(
        `INPut:ATTenuation:AUTO ${input.autoAttenuation ? "ON" : "OFF"}`,
      );
    }
    if (typeof input.attenuationDb === "number") {
      await this.port.write(`INPut:ATTenuation ${input.attenuationDb}`);
    }
    if (typeof input.preampEnabled === "boolean") {
      if (!this.input.preamp.available && input.preampEnabled) {
        throw new RangeError("this variant has no preamp");
      }
      if (this.input.preamp.available) {
        await this.port.write(
          `INPut:GAIN:STATe ${input.preampEnabled ? "ON" : "OFF"}`,
        );
      }
    }
  }

  async listMarkers(): Promise<readonly SpectrumAnalyzerMarkerReading[]> {
    const readings: SpectrumAnalyzerMarkerReading[] = [];
    for (let id = 1; id <= this.markers.count; id += 1) {
      readings.push(await this.readMarker(id));
    }
    return readings;
  }

  async setMarker(id: number, config: SpectrumAnalyzerMarkerConfig): Promise<void> {
    this.#assertMarker(id);
    if (!config.enabled) {
      await this.port.write(`CALCulate:MARKer${id}:STATe OFF`);
      return;
    }
    await this.port.write(`CALCulate:MARKer${id}:STATe ON`);
    if (typeof config.frequencyHz === "number") {
      await this.port.write(`CALCulate:MARKer${id}:X ${config.frequencyHz}`);
    }
  }

  async readMarker(id: number): Promise<SpectrumAnalyzerMarkerReading> {
    this.#assertMarker(id);
    const [stateRaw, xRaw, yRaw] = await Promise.all([
      safeQuery(this.port, `CALCulate:MARKer${id}:STATe?`),
      safeQuery(this.port, `CALCulate:MARKer${id}:X?`),
      safeQuery(this.port, `CALCulate:MARKer${id}:Y?`),
    ]);
    return {
      id,
      enabled: parseBool(stateRaw),
      type: "normal",
      frequencyHz: parseNumberOrZero(xRaw),
      amplitude: parseNumberOrZero(yRaw),
      unit: "dBm",
    };
  }

  async peakSearch(markerId: number): Promise<SpectrumAnalyzerMarkerReading> {
    this.#assertMarker(markerId);
    await this.port.write(`CALCulate:MARKer${markerId}:MAXimum:PEAK`);
    return this.readMarker(markerId);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    return Array.from({ length: this.presets.slots }, () => false);
  }

  async savePreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot}`);
  }

  #assertFrequency(hz: number, label: "start" | "stop"): void {
    if (
      !Number.isFinite(hz) ||
      hz < this.profile.frequencyMinHz ||
      hz > this.profile.frequencyMaxHz
    ) {
      throw new RangeError(
        `${label} frequency ${hz} outside ${this.profile.frequencyMinHz}..${this.profile.frequencyMaxHz} Hz`,
      );
    }
  }

  #assertTrace(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > this.profile.traceCount) {
      throw new RangeError(
        `trace ${id} outside 1..${this.profile.traceCount}`,
      );
    }
  }

  #assertMarker(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > this.profile.markerCount) {
      throw new RangeError(
        `marker ${id} outside 1..${this.profile.markerCount}`,
      );
    }
  }

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot ${slot} outside 0..${this.presets.slots - 1}`,
      );
    }
  }
}

function encodeTraceMode(mode: SpectrumAnalyzerTraceMode): string {
  switch (mode) {
    case "clearWrite":
      return "WRITe";
    case "maxHold":
      return "MAXHold";
    case "minHold":
      return "MINHold";
    case "average":
      return "AVERage";
    case "view":
      return "VIEW";
  }
}

function decodeTraceMode(raw: string): SpectrumAnalyzerTraceMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("MAX")) return "maxHold";
  if (v.startsWith("MIN")) return "minHold";
  if (v.startsWith("AVER")) return "average";
  if (v.startsWith("VIEW")) return "view";
  return "clearWrite";
}

function encodeDetector(det: SpectrumAnalyzerTraceDetector): string {
  switch (det) {
    case "peak":
      return "POSitive";
    case "negPeak":
      return "NEGative";
    case "sample":
      return "SAMPle";
    case "rms":
      return "RMS";
    case "average":
      return "AVERage";
  }
}

function decodeDetector(raw: string): SpectrumAnalyzerTraceDetector {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("NEG")) return "negPeak";
  if (v.startsWith("POS") || v === "PEAK") return "peak";
  if (v.startsWith("SAMP")) return "sample";
  if (v.startsWith("RMS")) return "rms";
  if (v.startsWith("AVER")) return "average";
  return "peak";
}

function parseCsvFloat64(raw: string): Float64Array {
  const trimmed = raw.trim();
  if (!trimmed) return new Float64Array();
  const parts = trimmed.split(",");
  const out = new Float64Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) {
    const n = Number(parts[i]);
    out[i] = Number.isFinite(n) ? n : 0;
  }
  return out;
}
