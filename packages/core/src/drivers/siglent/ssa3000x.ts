import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  ISpectrumAnalyzer,
  SpectrumAnalyzerAmplitudeUnit,
  SpectrumAnalyzerAveragingCapability,
  SpectrumAnalyzerAveragingConfig,
  SpectrumAnalyzerAveragingMode,
  SpectrumAnalyzerBandwidthInput,
  SpectrumAnalyzerBandwidthState,
  SpectrumAnalyzerChannelPowerCapability,
  SpectrumAnalyzerChannelPowerConfig,
  SpectrumAnalyzerChannelPowerMode,
  SpectrumAnalyzerChannelPowerReading,
  SpectrumAnalyzerFrequencyInput,
  SpectrumAnalyzerFrequencyState,
  SpectrumAnalyzerInputCapability,
  SpectrumAnalyzerInputInput,
  SpectrumAnalyzerInputState,
  SpectrumAnalyzerLimitCapability,
  SpectrumAnalyzerLimitLine,
  SpectrumAnalyzerLimitResult,
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
  SpectrumAnalyzerTriggerCapability,
  SpectrumAnalyzerTriggerConfig,
  SpectrumAnalyzerTriggerSlope,
  SpectrumAnalyzerTriggerSource,
} from "../../facades/spectrum-analyzer.js";
import type { InstrumentPresetCapability } from "../../facades/multimeter.js";
import { parseBool, parseNumberOrZero } from "../rigol/_shared/parsers.js";
import {
  type Ssa3000xProfile,
  SSA3000X_DEFAULT,
} from "./ssa3000x-profile.js";

const DEFAULT_TRACE_MODES: readonly SpectrumAnalyzerTraceMode[] = [
  "clearWrite",
  "maxHold",
  "minHold",
  "average",
  "view",
];
const DEFAULT_DETECTORS: readonly SpectrumAnalyzerTraceDetector[] = [
  "peak",
  "sample",
  "rms",
  "negPeak",
  "average",
];
const DEFAULT_MARKER_TYPES: readonly SpectrumAnalyzerMarkerType[] = [
  "normal",
  "delta",
  "peak",
  "band",
];
const DEFAULT_TRIGGER_SOURCES: readonly SpectrumAnalyzerTriggerSource[] = [
  "freeRun",
  "video",
  "external",
];
const DEFAULT_UNITS: readonly SpectrumAnalyzerAmplitudeUnit[] = [
  "dBm",
  "dBmV",
  "dBuV",
  "V",
  "W",
];

/**
 * Siglent SSA3000X / SSA3000X-R spectrum analyzer driver. Covers the family
 * from a single SCPI dialect; profile supplies frequency / preamp / TG
 * limits per variant. Capability objects are advertised based on the
 * profile: tracking generator only exposes itself on `-R` suffixes; preamp
 * range is clamped to the variant's usable band.
 */
export class SiglentSsa3000x implements ISpectrumAnalyzer {
  readonly kind = "spectrumAnalyzer" as const;
  readonly profile: Ssa3000xProfile;
  readonly traces: SpectrumAnalyzerTraceCapability;
  readonly input: SpectrumAnalyzerInputCapability;
  readonly markers: SpectrumAnalyzerMarkerCapability;
  readonly frequencyRangeHz: { readonly min: number; readonly max: number };
  readonly referenceLevelRangeDbm: { readonly min: number; readonly max: number };
  readonly channelPower: SpectrumAnalyzerChannelPowerCapability;
  readonly trigger: SpectrumAnalyzerTriggerCapability;
  readonly limitLines: SpectrumAnalyzerLimitCapability;
  readonly averaging: SpectrumAnalyzerAveragingCapability;
  readonly presets: InstrumentPresetCapability;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Ssa3000xProfile = SSA3000X_DEFAULT,
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
      modes: DEFAULT_TRACE_MODES,
      detectors: DEFAULT_DETECTORS,
      units: DEFAULT_UNITS,
    };
    this.input = {
      attenuationRangeDb: profile.attenuationRangeDb,
      preamp: profile.preampFreqRangeHz
        ? { available: true, freqRangeHz: profile.preampFreqRangeHz }
        : { available: false },
      inputImpedances: [50],
    };
    this.markers = {
      count: profile.markerCount,
      types: DEFAULT_MARKER_TYPES,
    };
    this.channelPower = {
      modes: ["channelPower", "acpr"],
      maxAdjacentChannels: 5,
    };
    this.trigger = {
      sources: DEFAULT_TRIGGER_SOURCES,
      levelRangeDbm: { min: -200, max: 30 },
    };
    this.limitLines = {
      count: profile.limitLineCount,
      maxPointsPerLine: 200,
    };
    this.averaging = {
      modes: ["logPower", "power", "voltage"],
      countRange: { min: 1, max: 1000 },
    };
    this.presets = { slots: profile.presetSlots };
  }

  // ---- primary setup -----------------------------------------------------

  async getFrequency(): Promise<SpectrumAnalyzerFrequencyState> {
    const [centerRaw, spanRaw, startRaw, stopRaw] = await Promise.all([
      this.port.query(":SENSe:FREQuency:CENTer?"),
      this.port.query(":SENSe:FREQuency:SPAN?"),
      this.port.query(":SENSe:FREQuency:STARt?"),
      this.port.query(":SENSe:FREQuency:STOP?"),
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
      if (!Number.isFinite(input.centerHz) || !Number.isFinite(input.spanHz)) {
        throw new RangeError("centerHz and spanHz must be finite numbers");
      }
      this.#assertFrequency(input.centerHz - input.spanHz / 2, "start");
      this.#assertFrequency(input.centerHz + input.spanHz / 2, "stop");
      await this.port.write(`:SENSe:FREQuency:CENTer ${input.centerHz}`);
      await this.port.write(`:SENSe:FREQuency:SPAN ${input.spanHz}`);
      return;
    }
    if (!Number.isFinite(input.startHz) || !Number.isFinite(input.stopHz)) {
      throw new RangeError("startHz and stopHz must be finite numbers");
    }
    if (input.stopHz <= input.startHz) {
      throw new RangeError("stopHz must be greater than startHz");
    }
    this.#assertFrequency(input.startHz, "start");
    this.#assertFrequency(input.stopHz, "stop");
    await this.port.write(`:SENSe:FREQuency:STARt ${input.startHz}`);
    await this.port.write(`:SENSe:FREQuency:STOP ${input.stopHz}`);
  }

  async getReferenceLevel(): Promise<SpectrumAnalyzerReferenceLevel> {
    const raw = await this.port.query(":DISPlay:WINDow:TRACe:Y:SCALe:RLEVel?");
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
    await this.port.write(`:DISPlay:WINDow:TRACe:Y:SCALe:RLEVel ${dbm}`);
  }

  async getBandwidth(): Promise<SpectrumAnalyzerBandwidthState> {
    const [rbwRaw, vbwRaw, autoRbwRaw, autoVbwRaw] = await Promise.all([
      this.port.query(":SENSe:BANDwidth:RESolution?"),
      this.port.query(":SENSe:BANDwidth:VIDeo?"),
      this.port.query(":SENSe:BANDwidth:RESolution:AUTO?"),
      this.port.query(":SENSe:BANDwidth:VIDeo:AUTO?"),
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
        `:SENSe:BANDwidth:RESolution:AUTO ${input.autoRbw ? "ON" : "OFF"}`,
      );
    }
    if (typeof input.autoVbw === "boolean") {
      await this.port.write(
        `:SENSe:BANDwidth:VIDeo:AUTO ${input.autoVbw ? "ON" : "OFF"}`,
      );
    }
    if (typeof input.rbwHz === "number") {
      if (!Number.isFinite(input.rbwHz) || input.rbwHz <= 0) {
        throw new RangeError("rbwHz must be a positive finite number");
      }
      await this.port.write(`:SENSe:BANDwidth:RESolution ${input.rbwHz}`);
    }
    if (typeof input.vbwHz === "number") {
      if (!Number.isFinite(input.vbwHz) || input.vbwHz <= 0) {
        throw new RangeError("vbwHz must be a positive finite number");
      }
      await this.port.write(`:SENSe:BANDwidth:VIDeo ${input.vbwHz}`);
    }
  }

  async getSweep(): Promise<SpectrumAnalyzerSweepState> {
    const [pointsRaw, timeRaw, contRaw] = await Promise.all([
      this.port.query(":SENSe:SWEep:POINts?"),
      this.port.query(":SENSe:SWEep:TIME?"),
      this.port.query(":INITiate:CONTinuous?"),
    ]);
    return {
      pointsN: Math.max(1, Math.round(parseNumberOrZero(pointsRaw))),
      timeSec: parseNumberOrZero(timeRaw),
      continuous: parseBool(contRaw),
    };
  }

  async setSweep(input: SpectrumAnalyzerSweepInput): Promise<void> {
    if (typeof input.pointsN === "number") {
      if (
        !Number.isInteger(input.pointsN) ||
        input.pointsN < 101 ||
        input.pointsN > this.profile.maxSweepPoints
      ) {
        throw new RangeError(
          `pointsN ${input.pointsN} outside 101..${this.profile.maxSweepPoints}`,
        );
      }
      await this.port.write(`:SENSe:SWEep:POINts ${input.pointsN}`);
    }
    if (typeof input.timeSec === "number") {
      if (!Number.isFinite(input.timeSec) || input.timeSec <= 0) {
        throw new RangeError("timeSec must be a positive finite number");
      }
      await this.port.write(`:SENSe:SWEep:TIME ${input.timeSec}`);
    }
    if (typeof input.continuous === "boolean") {
      await this.port.write(
        `:INITiate:CONTinuous ${input.continuous ? "ON" : "OFF"}`,
      );
    }
  }

  async singleSweep(): Promise<void> {
    await this.port.write(":INITiate:IMMediate");
  }

  // ---- traces ------------------------------------------------------------

  async getTraceConfig(traceId: number): Promise<SpectrumAnalyzerTraceConfig> {
    this.#assertTrace(traceId);
    const [modeRaw, detRaw, stateRaw] = await Promise.all([
      this.port.query(`:TRACe${traceId}:MODE?`),
      this.port.query(`:TRACe:DETector:FUNCtion?`),
      this.port.query(`:TRACe${traceId}:DISPlay?`),
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
      await this.port.write(`:TRACe${traceId}:MODE ${encodeTraceMode(config.mode)}`);
    }
    if (config.detector) {
      await this.port.write(
        `:TRACe:DETector:FUNCtion ${encodeDetector(config.detector)}`,
      );
    }
    if (typeof config.enabled === "boolean") {
      await this.port.write(
        `:TRACe${traceId}:DISPlay ${config.enabled ? "ON" : "OFF"}`,
      );
    }
  }

  async readTrace(traceId: number): Promise<SpectrumAnalyzerTraceData> {
    this.#assertTrace(traceId);
    const [freq, ampRaw] = await Promise.all([
      this.getFrequency(),
      this.port.query(`:TRACe:DATA? ${traceId}`, { timeoutMs: 10_000 }),
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

  // ---- input -------------------------------------------------------------

  async getInput(): Promise<SpectrumAnalyzerInputState> {
    const [attRaw, autoRaw, preampRaw] = await Promise.all([
      this.port.query(":SENSe:POWer:RF:ATTenuation?"),
      this.port.query(":SENSe:POWer:RF:ATTenuation:AUTO?"),
      this.input.preamp.available
        ? this.port.query(":SENSe:POWer:RF:GAIN:STATe?")
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
        `:SENSe:POWer:RF:ATTenuation:AUTO ${input.autoAttenuation ? "ON" : "OFF"}`,
      );
    }
    if (typeof input.attenuationDb === "number") {
      const range = this.input.attenuationRangeDb;
      if (
        !Number.isFinite(input.attenuationDb) ||
        input.attenuationDb < range.min ||
        input.attenuationDb > range.max
      ) {
        throw new RangeError(
          `attenuation ${input.attenuationDb} outside ${range.min}..${range.max} dB`,
        );
      }
      await this.port.write(
        `:SENSe:POWer:RF:ATTenuation ${input.attenuationDb}`,
      );
    }
    if (typeof input.preampEnabled === "boolean") {
      if (!this.input.preamp.available && input.preampEnabled) {
        throw new RangeError("this variant has no preamp");
      }
      if (this.input.preamp.available) {
        await this.port.write(
          `:SENSe:POWer:RF:GAIN:STATe ${input.preampEnabled ? "ON" : "OFF"}`,
        );
      }
    }
    if (input.inputImpedanceOhm && input.inputImpedanceOhm !== 50) {
      throw new RangeError("SSA3000X supports 50 Ω input only");
    }
  }

  // ---- markers -----------------------------------------------------------

  async listMarkers(): Promise<readonly SpectrumAnalyzerMarkerReading[]> {
    const readings: SpectrumAnalyzerMarkerReading[] = [];
    for (let id = 1; id <= this.markers.count; id += 1) {
      readings.push(await this.readMarker(id));
    }
    return readings;
  }

  async setMarker(
    id: number,
    config: SpectrumAnalyzerMarkerConfig,
  ): Promise<void> {
    this.#assertMarker(id);
    if (!config.enabled) {
      await this.port.write(`:CALCulate:MARKer${id}:STATe OFF`);
      return;
    }
    await this.port.write(`:CALCulate:MARKer${id}:STATe ON`);
    await this.port.write(
      `:CALCulate:MARKer${id}:MODE ${encodeMarkerType(config.type)}`,
    );
    if (config.type === "delta" && typeof config.reference === "number") {
      await this.port.write(
        `:CALCulate:MARKer${id}:REFerence ${config.reference}`,
      );
    }
    if (typeof config.frequencyHz === "number") {
      await this.port.write(
        `:CALCulate:MARKer${id}:X ${config.frequencyHz}`,
      );
    }
    if (typeof config.traceId === "number") {
      this.#assertTrace(config.traceId);
      await this.port.write(
        `:CALCulate:MARKer${id}:TRACe ${config.traceId}`,
      );
    }
    if (config.type === "band" && typeof config.bandSpanHz === "number") {
      await this.port.write(
        `:CALCulate:MARKer${id}:FUNCtion:BAND:SPAN ${config.bandSpanHz}`,
      );
    }
  }

  async readMarker(id: number): Promise<SpectrumAnalyzerMarkerReading> {
    this.#assertMarker(id);
    const [stateRaw, typeRaw, xRaw, yRaw] = await Promise.all([
      this.port.query(`:CALCulate:MARKer${id}:STATe?`),
      this.port.query(`:CALCulate:MARKer${id}:MODE?`),
      this.port.query(`:CALCulate:MARKer${id}:X?`),
      this.port.query(`:CALCulate:MARKer${id}:Y?`),
    ]);
    return {
      id,
      enabled: parseBool(stateRaw),
      type: decodeMarkerType(typeRaw),
      frequencyHz: parseNumberOrZero(xRaw),
      amplitude: parseNumberOrZero(yRaw),
      unit: "dBm",
    };
  }

  async peakSearch(markerId: number): Promise<SpectrumAnalyzerMarkerReading> {
    this.#assertMarker(markerId);
    await this.port.write(`:CALCulate:MARKer${markerId}:MAXimum`);
    return this.readMarker(markerId);
  }

  // ---- channel power -----------------------------------------------------

  async getChannelPower(): Promise<SpectrumAnalyzerChannelPowerConfig> {
    const [stateRaw, modeRaw, ibwRaw, spaceRaw, adjRaw] = await Promise.all([
      this.port.query(":SENSe:POWer:ACHannel:STATe?"),
      this.port.query(":CONFigure:POWer:MODE?"),
      this.port.query(":SENSe:POWer:ACHannel:BANDwidth:INTegration?"),
      this.port.query(":SENSe:POWer:ACHannel:SPACing?"),
      this.port.query(":SENSe:POWer:ACHannel:COUNt?"),
    ]);
    return {
      enabled: parseBool(stateRaw),
      mode: decodeChannelPowerMode(modeRaw),
      integrationBandwidthHz: parseNumberOrZero(ibwRaw),
      channelSpacingHz: parseNumberOrZero(spaceRaw),
      adjacentChannelCount: Math.max(
        0,
        Math.round(parseNumberOrZero(adjRaw)),
      ),
    };
  }

  async setChannelPower(
    config: SpectrumAnalyzerChannelPowerConfig,
  ): Promise<void> {
    await this.port.write(
      `:CONFigure:POWer:MODE ${config.mode === "acpr" ? "ACPR" : "CHPower"}`,
    );
    await this.port.write(
      `:SENSe:POWer:ACHannel:BANDwidth:INTegration ${config.integrationBandwidthHz}`,
    );
    if (config.mode === "acpr") {
      await this.port.write(
        `:SENSe:POWer:ACHannel:SPACing ${config.channelSpacingHz}`,
      );
      await this.port.write(
        `:SENSe:POWer:ACHannel:COUNt ${config.adjacentChannelCount}`,
      );
    }
    await this.port.write(
      `:SENSe:POWer:ACHannel:STATe ${config.enabled ? "ON" : "OFF"}`,
    );
  }

  async readChannelPower(): Promise<SpectrumAnalyzerChannelPowerReading> {
    const raw = await this.port.query(":READ:CHPower?");
    const parts = parseCsvFloat64(raw);
    return {
      mode: "channelPower",
      channelPowerDbm: parts[0] ?? 0,
      adjacentChannelsDbc:
        parts.length > 1 ? Array.from(parts.slice(1)) : undefined,
    };
  }

  // ---- trigger -----------------------------------------------------------

  async getTrigger(): Promise<SpectrumAnalyzerTriggerConfig> {
    const [sourceRaw, levelRaw, slopeRaw] = await Promise.all([
      this.port.query(":TRIGger:SEQuence:SOURce?"),
      this.port.query(":TRIGger:SEQuence:VIDeo:LEVel?"),
      this.port.query(":TRIGger:SEQuence:EXTernal:SLOPe?"),
    ]);
    return {
      source: decodeTriggerSource(sourceRaw),
      levelDbm: parseNumberOrZero(levelRaw),
      slope: decodeTriggerSlope(slopeRaw),
    };
  }

  async setTrigger(config: SpectrumAnalyzerTriggerConfig): Promise<void> {
    await this.port.write(
      `:TRIGger:SEQuence:SOURce ${encodeTriggerSource(config.source)}`,
    );
    if (typeof config.levelDbm === "number") {
      await this.port.write(
        `:TRIGger:SEQuence:VIDeo:LEVel ${config.levelDbm}`,
      );
    }
    if (config.slope) {
      await this.port.write(
        `:TRIGger:SEQuence:EXTernal:SLOPe ${config.slope === "rising" ? "POSitive" : "NEGative"}`,
      );
    }
  }

  // ---- limit lines -------------------------------------------------------

  async listLimitLines(): Promise<readonly SpectrumAnalyzerLimitLine[]> {
    const out: SpectrumAnalyzerLimitLine[] = [];
    for (let id = 1; id <= this.limitLines.count; id += 1) {
      try {
        const [stateRaw, labelRaw] = await Promise.all([
          this.port.query(`:CALCulate:LLINe${id}:STATe?`),
          this.port.query(`:CALCulate:LLINe${id}:TITle?`),
        ]);
        out.push({
          id,
          enabled: parseBool(stateRaw),
          label: labelRaw.trim().replace(/"/g, "") || `LIMIT${id}`,
          kind: "upper",
          points: [],
        });
      } catch {
        /* slot not populated */
      }
    }
    return out;
  }

  async setLimitLine(line: SpectrumAnalyzerLimitLine): Promise<void> {
    if (line.id < 1 || line.id > this.limitLines.count) {
      throw new RangeError(
        `limit line id ${line.id} outside 1..${this.limitLines.count}`,
      );
    }
    if (line.points.length > this.limitLines.maxPointsPerLine) {
      throw new RangeError(
        `limit line has ${line.points.length} points, max ${this.limitLines.maxPointsPerLine}`,
      );
    }
    await this.port.write(
      `:CALCulate:LLINe${line.id}:TITle "${line.label.replace(/"/g, "")}"`,
    );
    const payload = line.points
      .map((p) => `${p.frequencyHz},${p.amplitudeDbm}`)
      .join(",");
    if (payload) {
      await this.port.write(`:CALCulate:LLINe${line.id}:DATA ${payload}`);
    }
    await this.port.write(
      `:CALCulate:LLINe${line.id}:STATe ${line.enabled ? "ON" : "OFF"}`,
    );
  }

  async deleteLimitLine(id: number): Promise<void> {
    await this.port.write(`:CALCulate:LLINe${id}:DELete`);
  }

  async readLimitResults(): Promise<readonly SpectrumAnalyzerLimitResult[]> {
    const out: SpectrumAnalyzerLimitResult[] = [];
    for (let id = 1; id <= this.limitLines.count; id += 1) {
      try {
        const raw = await this.port.query(
          `:CALCulate:LLINe${id}:FAIL:POINts?`,
        );
        const failed = Math.max(0, Math.round(parseNumberOrZero(raw)));
        out.push({ id, passed: failed === 0, failedPoints: failed });
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  // ---- averaging ---------------------------------------------------------

  async getAveraging(): Promise<SpectrumAnalyzerAveragingConfig> {
    const [stateRaw, countRaw, modeRaw] = await Promise.all([
      this.port.query(":SENSe:AVERage:TRACe1:STATe?"),
      this.port.query(":SENSe:AVERage:TRACe1:COUNt?"),
      this.port.query(":SENSe:AVERage:TYPE?"),
    ]);
    return {
      enabled: parseBool(stateRaw),
      count: Math.max(1, Math.round(parseNumberOrZero(countRaw))),
      mode: decodeAveragingMode(modeRaw),
    };
  }

  async setAveraging(config: SpectrumAnalyzerAveragingConfig): Promise<void> {
    if (
      !Number.isInteger(config.count) ||
      config.count < this.averaging.countRange.min ||
      config.count > this.averaging.countRange.max
    ) {
      throw new RangeError(
        `averaging count ${config.count} outside ${this.averaging.countRange.min}..${this.averaging.countRange.max}`,
      );
    }
    await this.port.write(`:SENSe:AVERage:TRACe1:COUNt ${config.count}`);
    await this.port.write(
      `:SENSe:AVERage:TYPE ${encodeAveragingMode(config.mode)}`,
    );
    await this.port.write(
      `:SENSe:AVERage:TRACe1:STATe ${config.enabled ? "ON" : "OFF"}`,
    );
  }

  // ---- presets -----------------------------------------------------------

  async getPresetCatalog(): Promise<readonly boolean[]> {
    return Array.from({ length: this.presets.slots }, () => true);
  }

  async savePreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot}`);
  }

  // ---- internal ----------------------------------------------------------

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

// ---- encode / decode helpers ---------------------------------------------

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

function encodeMarkerType(type: SpectrumAnalyzerMarkerType): string {
  switch (type) {
    case "normal":
      return "POSition";
    case "delta":
      return "DELTa";
    case "peak":
      return "POSition";
    case "band":
      return "BAND";
  }
}

function decodeMarkerType(raw: string): SpectrumAnalyzerMarkerType {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("DELT")) return "delta";
  if (v.startsWith("BAND")) return "band";
  if (v.startsWith("PEAK")) return "peak";
  return "normal";
}

function decodeChannelPowerMode(raw: string): SpectrumAnalyzerChannelPowerMode {
  return /ACP|ACPR/i.test(raw) ? "acpr" : "channelPower";
}

function encodeTriggerSource(source: SpectrumAnalyzerTriggerSource): string {
  switch (source) {
    case "freeRun":
      return "IMMediate";
    case "video":
      return "VIDeo";
    case "external":
      return "EXTernal";
    case "if":
      return "IF";
    case "fmt":
      return "FMT";
  }
}

function decodeTriggerSource(raw: string): SpectrumAnalyzerTriggerSource {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("VID")) return "video";
  if (v.startsWith("EXT")) return "external";
  if (v.startsWith("IF")) return "if";
  if (v.startsWith("FMT")) return "fmt";
  return "freeRun";
}

function decodeTriggerSlope(raw: string): SpectrumAnalyzerTriggerSlope {
  return /NEG|FALL/i.test(raw) ? "falling" : "rising";
}

function encodeAveragingMode(mode: SpectrumAnalyzerAveragingMode): string {
  switch (mode) {
    case "logPower":
      return "LOG";
    case "power":
      return "POWer";
    case "voltage":
      return "VOLTage";
  }
}

function decodeAveragingMode(raw: string): SpectrumAnalyzerAveragingMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("POW")) return "power";
  if (v.startsWith("VOLT")) return "voltage";
  return "logPower";
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
