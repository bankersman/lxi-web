import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { OutputKillResult } from "../../facades/output-kill.js";
import { runSgDisableAll } from "../../facades/output-kill.js";
import type {
  ISignalGenerator,
  SignalGeneratorActualSetpoints,
  SignalGeneratorArbitraryCapability,
  SignalGeneratorArbitrarySample,
  SignalGeneratorArbitraryUploadResult,
  SignalGeneratorBurstCapability,
  SignalGeneratorBurstConfig,
  SignalGeneratorChannelLimits,
  SignalGeneratorChannelState,
  SignalGeneratorChannelsCapability,
  SignalGeneratorModulationCapability,
  SignalGeneratorModulationConfig,
  SignalGeneratorOutputImpedance,
  SignalGeneratorSweepCapability,
  SignalGeneratorSweepConfig,
  SignalGeneratorSyncCapability,
  SignalGeneratorSyncState,
  SignalGeneratorWaveform,
  SignalGeneratorWaveformType,
} from "../../facades/signal-generator.js";
import type { InstrumentPresetCapability } from "../../facades/multimeter.js";
import { type Dg900Profile, DG900_DEFAULT } from "./dg900-profile.js";
import { parseBool, parseNumberOrZero } from "./_shared/index.js";

const DEFAULT_WAVEFORMS: readonly SignalGeneratorWaveformType[] = [
  "sine",
  "square",
  "ramp",
  "pulse",
  "noise",
  "dc",
  "arbitrary",
];

/**
 * Rigol DG800 / DG900 signal-generator driver. Covers DG811..DG972 — the SCPI
 * tree is shared; profile supplies the per-variant limits (frequency ceiling,
 * channel count, arbitrary memory depth). Capability objects advertise the
 * full superset; channels list shrinks or grows based on the profile.
 */
export class RigolDg900 implements ISignalGenerator {
  readonly kind = "signalGenerator" as const;
  readonly profile: Dg900Profile;
  readonly channels: SignalGeneratorChannelsCapability;
  readonly modulation: SignalGeneratorModulationCapability;
  readonly sweep: SignalGeneratorSweepCapability;
  readonly burst: SignalGeneratorBurstCapability;
  readonly arbitrary: SignalGeneratorArbitraryCapability;
  readonly sync: SignalGeneratorSyncCapability;
  readonly presets: InstrumentPresetCapability;

  #uploads: SignalGeneratorArbitrarySample[] = [];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Dg900Profile = DG900_DEFAULT,
  ) {
    this.profile = profile;

    const channelLimits: SignalGeneratorChannelLimits = {
      frequencyMaxHz: profile.frequencyMaxHz,
      amplitudeRangeVpp: { min: 0.002, max: profile.amplitudeMaxVpp },
      offsetRangeV: { min: -10, max: 10 },
      outputImpedanceModes: ["50ohm", "highZ"],
      supportedWaveforms: DEFAULT_WAVEFORMS,
    };
    this.channels = {
      channels: Array.from({ length: profile.channelCount }, () => channelLimits),
    };

    this.modulation = {
      types: ["am", "fm", "pm", "pwm", "fsk", "ask", "psk"],
      sources: ["internal", "external"],
      waveforms: ["sine", "square", "triangle", "ramp", "noise"],
      depthRange: {
        am: { min: 0, max: 120 },
        fm: { min: 0, max: profile.frequencyMaxHz },
        pm: { min: 0, max: 360 },
        pwm: { min: 0, max: 100 },
        fsk: { min: 0, max: profile.frequencyMaxHz },
        ask: { min: 0, max: profile.amplitudeMaxVpp },
        psk: { min: 0, max: 360 },
      },
      modulatingFrequencyRangeHz: { min: 0.001, max: 1e6 },
    };

    this.sweep = {
      spacings: ["linear", "logarithmic"],
      triggers: ["immediate", "external", "manual"],
      timeRangeSec: { min: 1e-3, max: 500 },
    };

    this.burst = {
      modes: ["triggered", "gated", "nCycle"],
      triggers: ["immediate", "external", "manual"],
      cyclesRange: { min: 1, max: 1_000_000 },
    };

    this.arbitrary = {
      maxSamples: profile.arbitraryMaxSamples,
      builtins: [
        "SINC",
        "EXP_RISE",
        "EXP_FALL",
        "CARDIAC",
        "GAUSS",
        "HAVERSINE",
        "LORENTZ",
        "DUALTONE",
      ],
      sampleRateRange: { min: 1e-6, max: profile.sampleRateMaxHz },
    };

    this.sync = {
      channels: profile.channelCount === 2 ? [1, 2] : [1],
      hasCommonClock: true,
    };

    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<readonly SignalGeneratorChannelState[]> {
    const states: SignalGeneratorChannelState[] = [];
    for (let i = 1; i <= this.profile.channelCount; i += 1) {
      states.push(await this.getChannelState(i));
    }
    return states;
  }

  async getChannelState(channel: number): Promise<SignalGeneratorChannelState> {
    this.#assertChannel(channel);
    const [
      enabledRaw,
      functionRaw,
      freqRaw,
      ampRaw,
      offsetRaw,
      phaseRaw,
      dutyRaw,
      symmetryRaw,
      pulseWidthRaw,
      pulseRiseRaw,
      pulseFallRaw,
      impedanceRaw,
    ] = await Promise.all([
      this.port.query(`:OUTPut${channel}?`),
      this.port.query(`:SOURce${channel}:FUNCtion?`),
      this.port.query(`:SOURce${channel}:FREQuency?`),
      this.port.query(`:SOURce${channel}:VOLTage?`),
      this.port.query(`:SOURce${channel}:VOLTage:OFFSet?`),
      this.port.query(`:SOURce${channel}:PHASe?`),
      this.port.query(`:SOURce${channel}:FUNCtion:SQUare:DCYCle?`),
      this.port.query(`:SOURce${channel}:FUNCtion:RAMP:SYMMetry?`),
      this.port.query(`:SOURce${channel}:FUNCtion:PULSe:WIDTh?`),
      this.port.query(`:SOURce${channel}:FUNCtion:PULSe:TRANsition:LEADing?`),
      this.port.query(`:SOURce${channel}:FUNCtion:PULSe:TRANsition:TRAiling?`),
      this.port.query(`:OUTPut${channel}:IMPedance?`),
    ]);

    const type = decodeWaveformType(functionRaw);
    const base = {
      frequencyHz: parseNumberOrZero(freqRaw),
      amplitudeVpp: parseNumberOrZero(ampRaw),
      offsetV: parseNumberOrZero(offsetRaw),
      phaseDeg: parseNumberOrZero(phaseRaw),
    };
    const waveform: SignalGeneratorWaveform =
      type === "sine"
        ? { type: "sine", ...base }
        : type === "square"
          ? { type: "square", ...base, dutyPct: parseNumberOrZero(dutyRaw) }
          : type === "ramp"
            ? { type: "ramp", ...base, symmetryPct: parseNumberOrZero(symmetryRaw) }
            : type === "pulse"
              ? {
                  type: "pulse",
                  ...base,
                  widthS: parseNumberOrZero(pulseWidthRaw),
                  riseTimeS: parseNumberOrZero(pulseRiseRaw),
                  fallTimeS: parseNumberOrZero(pulseFallRaw),
                }
              : type === "noise"
                ? {
                    type: "noise",
                    amplitudeVpp: base.amplitudeVpp,
                    offsetV: base.offsetV,
                  }
                : type === "dc"
                  ? { type: "dc", offsetV: base.offsetV }
                  : { type: "arbitrary", ...base };

    return {
      id: channel,
      label: `CH${channel}`,
      enabled: parseBool(enabledRaw),
      impedance: decodeImpedance(impedanceRaw),
      waveform,
      actual: {
        frequencyHz: base.frequencyHz,
        amplitudeVpp: base.amplitudeVpp,
        offsetV: base.offsetV,
      },
      limits: this.channels.channels[channel - 1]!,
    };
  }

  async getChannelStatus(channel: number): Promise<SignalGeneratorActualSetpoints> {
    this.#assertChannel(channel);
    const [freqRaw, ampRaw, offsetRaw] = await Promise.all([
      this.port.query(`:SOURce${channel}:FREQuency?`),
      this.port.query(`:SOURce${channel}:VOLTage?`),
      this.port.query(`:SOURce${channel}:VOLTage:OFFSet?`),
    ]);
    return {
      frequencyHz: parseNumberOrZero(freqRaw),
      amplitudeVpp: parseNumberOrZero(ampRaw),
      offsetV: parseNumberOrZero(offsetRaw),
    };
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(`:OUTPut${channel} ${enabled ? "ON" : "OFF"}`);
  }

  async setWaveform(
    channel: number,
    config: SignalGeneratorWaveform,
  ): Promise<void> {
    this.#assertChannel(channel);
    this.#validateWaveform(config);

    // Set shape first so the instrument knows which per-shape parameters are
    // valid. Then push shared parameters (frequency, amplitude, offset,
    // phase) and finally any shape-specific extras.
    await this.port.write(
      `:SOURce${channel}:FUNCtion ${encodeWaveformType(config.type)}`,
    );

    if (config.type !== "dc" && config.type !== "noise") {
      await this.port.write(
        `:SOURce${channel}:FREQuency ${(config as { frequencyHz: number }).frequencyHz}`,
      );
    }
    if (config.type !== "dc") {
      await this.port.write(
        `:SOURce${channel}:VOLTage ${(config as { amplitudeVpp: number }).amplitudeVpp}`,
      );
    }
    await this.port.write(
      `:SOURce${channel}:VOLTage:OFFSet ${(config as { offsetV: number }).offsetV}`,
    );
    if (
      config.type !== "dc" &&
      config.type !== "noise" &&
      "phaseDeg" in config &&
      typeof config.phaseDeg === "number"
    ) {
      await this.port.write(`:SOURce${channel}:PHASe ${config.phaseDeg}`);
    }
    if (config.type === "square" && typeof config.dutyPct === "number") {
      await this.port.write(
        `:SOURce${channel}:FUNCtion:SQUare:DCYCle ${config.dutyPct}`,
      );
    }
    if (config.type === "ramp" && typeof config.symmetryPct === "number") {
      await this.port.write(
        `:SOURce${channel}:FUNCtion:RAMP:SYMMetry ${config.symmetryPct}`,
      );
    }
    if (config.type === "pulse") {
      if (typeof config.widthS === "number") {
        await this.port.write(
          `:SOURce${channel}:FUNCtion:PULSe:WIDTh ${config.widthS}`,
        );
      }
      if (typeof config.riseTimeS === "number") {
        await this.port.write(
          `:SOURce${channel}:FUNCtion:PULSe:TRANsition:LEADing ${config.riseTimeS}`,
        );
      }
      if (typeof config.fallTimeS === "number") {
        await this.port.write(
          `:SOURce${channel}:FUNCtion:PULSe:TRANsition:TRAiling ${config.fallTimeS}`,
        );
      }
    }
    if (config.type === "arbitrary") {
      if (config.builtinName) {
        await this.port.write(
          `:SOURce${channel}:FUNCtion:ARB ${config.builtinName}`,
        );
      } else if (config.sampleId) {
        await this.port.write(
          `:SOURce${channel}:FUNCtion:ARB ${config.sampleId}`,
        );
      }
    }
  }

  async setOutputImpedance(
    channel: number,
    mode: SignalGeneratorOutputImpedance,
  ): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(
      `:OUTPut${channel}:IMPedance ${mode === "highZ" ? "INFinity" : "50"}`,
    );
  }

  async getModulation(channel: number): Promise<SignalGeneratorModulationConfig> {
    this.#assertChannel(channel);
    const [stateRaw, typeRaw, sourceRaw, depthRaw, freqRaw, waveRaw] =
      await Promise.all([
        this.port.query(`:SOURce${channel}:MOD?`),
        this.port.query(`:SOURce${channel}:MOD:TYPe?`),
        this.port.query(`:SOURce${channel}:MOD:AM:SOURce?`),
        this.port.query(`:SOURce${channel}:MOD:AM:DEPTh?`),
        this.port.query(`:SOURce${channel}:MOD:AM:INTernal:FREQuency?`),
        this.port.query(`:SOURce${channel}:MOD:AM:INTernal:FUNCtion?`),
      ]);
    return {
      enabled: parseBool(stateRaw),
      type: decodeModulationType(typeRaw),
      source: /EXT/i.test(sourceRaw) ? "external" : "internal",
      depth: parseNumberOrZero(depthRaw),
      modulatingFrequencyHz: parseNumberOrZero(freqRaw),
      modulatingWaveform: decodeModulationWaveform(waveRaw),
    };
  }

  async setModulation(
    channel: number,
    config: SignalGeneratorModulationConfig,
  ): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(
      `:SOURce${channel}:MOD:TYPe ${encodeModulationType(config.type)}`,
    );
    await this.port.write(
      `:SOURce${channel}:MOD:AM:SOURce ${config.source === "external" ? "EXT" : "INT"}`,
    );
    await this.port.write(`:SOURce${channel}:MOD:AM:DEPTh ${config.depth}`);
    await this.port.write(
      `:SOURce${channel}:MOD:AM:INTernal:FREQuency ${config.modulatingFrequencyHz}`,
    );
    await this.port.write(
      `:SOURce${channel}:MOD:AM:INTernal:FUNCtion ${encodeModulationWaveform(
        config.modulatingWaveform,
      )}`,
    );
    await this.port.write(
      `:SOURce${channel}:MOD ${config.enabled ? "ON" : "OFF"}`,
    );
  }

  async getSweep(channel: number): Promise<SignalGeneratorSweepConfig> {
    this.#assertChannel(channel);
    const [stateRaw, startRaw, stopRaw, timeRaw, spacingRaw, triggerRaw] =
      await Promise.all([
        this.port.query(`:SOURce${channel}:SWEep:STATe?`),
        this.port.query(`:SOURce${channel}:FREQuency:STARt?`),
        this.port.query(`:SOURce${channel}:FREQuency:STOP?`),
        this.port.query(`:SOURce${channel}:SWEep:TIME?`),
        this.port.query(`:SOURce${channel}:SWEep:SPACing?`),
        this.port.query(`:SOURce${channel}:SWEep:TRIGger:SOURce?`),
      ]);
    return {
      enabled: parseBool(stateRaw),
      startHz: parseNumberOrZero(startRaw),
      stopHz: parseNumberOrZero(stopRaw),
      timeSec: parseNumberOrZero(timeRaw),
      spacing: /LOG/i.test(spacingRaw) ? "logarithmic" : "linear",
      trigger: decodeSweepTrigger(triggerRaw),
    };
  }

  async setSweep(
    channel: number,
    config: SignalGeneratorSweepConfig,
  ): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(`:SOURce${channel}:FREQuency:STARt ${config.startHz}`);
    await this.port.write(`:SOURce${channel}:FREQuency:STOP ${config.stopHz}`);
    await this.port.write(`:SOURce${channel}:SWEep:TIME ${config.timeSec}`);
    await this.port.write(
      `:SOURce${channel}:SWEep:SPACing ${config.spacing === "logarithmic" ? "LOGarithmic" : "LINear"}`,
    );
    await this.port.write(
      `:SOURce${channel}:SWEep:TRIGger:SOURce ${encodeTrigger(config.trigger)}`,
    );
    await this.port.write(
      `:SOURce${channel}:SWEep:STATe ${config.enabled ? "ON" : "OFF"}`,
    );
  }

  async getBurst(channel: number): Promise<SignalGeneratorBurstConfig> {
    this.#assertChannel(channel);
    const [stateRaw, modeRaw, cyclesRaw, periodRaw, triggerRaw, phaseRaw] =
      await Promise.all([
        this.port.query(`:SOURce${channel}:BURSt:STATe?`),
        this.port.query(`:SOURce${channel}:BURSt:MODE?`),
        this.port.query(`:SOURce${channel}:BURSt:NCYCles?`),
        this.port.query(`:SOURce${channel}:BURSt:INTernal:PERiod?`),
        this.port.query(`:SOURce${channel}:BURSt:TRIGger:SOURce?`),
        this.port.query(`:SOURce${channel}:BURSt:PHASe?`),
      ]);
    return {
      enabled: parseBool(stateRaw),
      mode: decodeBurstMode(modeRaw),
      cycles: Math.max(1, Math.round(parseNumberOrZero(cyclesRaw))),
      periodSec: parseNumberOrZero(periodRaw),
      trigger: decodeBurstTrigger(triggerRaw),
      startPhaseDeg: parseNumberOrZero(phaseRaw),
    };
  }

  async setBurst(
    channel: number,
    config: SignalGeneratorBurstConfig,
  ): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(
      `:SOURce${channel}:BURSt:MODE ${encodeBurstMode(config.mode)}`,
    );
    await this.port.write(`:SOURce${channel}:BURSt:NCYCles ${config.cycles}`);
    await this.port.write(
      `:SOURce${channel}:BURSt:INTernal:PERiod ${config.periodSec}`,
    );
    await this.port.write(
      `:SOURce${channel}:BURSt:TRIGger:SOURce ${encodeTrigger(config.trigger)}`,
    );
    await this.port.write(`:SOURce${channel}:BURSt:PHASe ${config.startPhaseDeg}`);
    await this.port.write(
      `:SOURce${channel}:BURSt:STATe ${config.enabled ? "ON" : "OFF"}`,
    );
  }

  async listArbitrarySamples(): Promise<readonly SignalGeneratorArbitrarySample[]> {
    // DG800/DG900 doesn't expose a stable directory listing over SCPI; the
    // samples table is local to the driver instance for now. Built-ins are
    // advertised via the capability.
    return this.#uploads.slice();
  }

  async uploadArbitrary(
    channel: number,
    name: string,
    samples: Float32Array | Int16Array,
  ): Promise<SignalGeneratorArbitraryUploadResult> {
    this.#assertChannel(channel);
    if (!/^[A-Za-z0-9_\-]{1,32}$/.test(name)) {
      throw new RangeError(
        `arbitrary sample name must be 1..32 chars, alphanumeric/_/-`,
      );
    }
    if (samples.length === 0 || samples.length > this.arbitrary.maxSamples) {
      throw new RangeError(
        `sample count ${samples.length} outside 1..${this.arbitrary.maxSamples}`,
      );
    }
    const int16 = toInt16Samples(samples);
    const payload = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    await this.port.writeBinary(
      `:SOURce${channel}:TRACe:DATA:DAC16 VOLATILE,END,`,
      payload,
    );
    await this.port.write(`:SOURce${channel}:DATA:COPY ${name}`);
    const sample: SignalGeneratorArbitrarySample = {
      id: name,
      name,
      sampleCount: samples.length,
    };
    const idx = this.#uploads.findIndex((s) => s.id === name);
    if (idx >= 0) this.#uploads[idx] = sample;
    else this.#uploads.push(sample);
    return { sampleId: name, sampleCount: samples.length };
  }

  async deleteArbitrary(sampleId: string): Promise<void> {
    this.#uploads = this.#uploads.filter((s) => s.id !== sampleId);
    await this.port.write(`:SOURce1:DATA:DELete ${sampleId}`);
  }

  async getSync(): Promise<SignalGeneratorSyncState> {
    if (this.profile.channelCount === 1) {
      const common = await this.port.query(":SYSTem:ROSCillator:SOURce?");
      return {
        phaseAligned: false,
        commonClockEnabled: /EXT/i.test(common),
      };
    }
    const [phaseRaw, clockRaw] = await Promise.all([
      this.port.query(":PHASe:SYNChronize?"),
      this.port.query(":SYSTem:ROSCillator:SOURce?"),
    ]);
    return {
      phaseAligned: parseBool(phaseRaw),
      commonClockEnabled: /EXT/i.test(clockRaw),
    };
  }

  async alignPhase(): Promise<void> {
    if (this.profile.channelCount < 2) return;
    await this.port.write(":PHASe:SYNChronize");
  }

  async setCommonClock(enabled: boolean): Promise<void> {
    await this.port.write(
      `:SYSTem:ROSCillator:SOURce ${enabled ? "EXTernal" : "INTernal"}`,
    );
  }

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

  #assertChannel(channel: number): void {
    if (!Number.isInteger(channel) || channel < 1 || channel > this.profile.channelCount) {
      throw new RangeError(
        `channel ${channel} outside 1..${this.profile.channelCount}`,
      );
    }
  }

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }

  #validateWaveform(config: SignalGeneratorWaveform): void {
    const { channels } = this.channels;
    const limits = channels[0]!;
    if (config.type !== "noise" && config.type !== "dc") {
      const freq = (config as { frequencyHz: number }).frequencyHz;
      if (!Number.isFinite(freq) || freq < 0 || freq > limits.frequencyMaxHz) {
        throw new RangeError(
          `frequency ${freq} outside 0..${limits.frequencyMaxHz} Hz`,
        );
      }
    }
    if (config.type !== "dc") {
      const amp = (config as { amplitudeVpp: number }).amplitudeVpp;
      if (
        !Number.isFinite(amp) ||
        amp < limits.amplitudeRangeVpp.min ||
        amp > limits.amplitudeRangeVpp.max
      ) {
        throw new RangeError(
          `amplitude ${amp} outside ${limits.amplitudeRangeVpp.min}..${limits.amplitudeRangeVpp.max} Vpp`,
        );
      }
    }
    const offset = (config as { offsetV: number }).offsetV;
    if (
      !Number.isFinite(offset) ||
      offset < limits.offsetRangeV.min ||
      offset > limits.offsetRangeV.max
    ) {
      throw new RangeError(
        `offset ${offset} outside ${limits.offsetRangeV.min}..${limits.offsetRangeV.max} V`,
      );
    }
    if (config.type === "square" && typeof config.dutyPct === "number") {
      if (config.dutyPct < 0 || config.dutyPct > 100) {
        throw new RangeError(`duty cycle ${config.dutyPct} outside 0..100%`);
      }
    }
    if (config.type === "arbitrary" && config.builtinName && config.sampleId) {
      throw new RangeError("specify builtinName or sampleId, not both");
    }
  }

  async disableAllOutputs(): Promise<OutputKillResult> {
    return runSgDisableAll(this);
  }
}

// ---- SCPI encode / decode helpers --------------------------------------

function encodeWaveformType(type: SignalGeneratorWaveformType): string {
  switch (type) {
    case "sine":
      return "SIN";
    case "square":
      return "SQU";
    case "ramp":
      return "RAMP";
    case "pulse":
      return "PULS";
    case "noise":
      return "NOIS";
    case "dc":
      return "DC";
    case "arbitrary":
      return "USER";
  }
}

function decodeWaveformType(raw: string): SignalGeneratorWaveformType {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("SQU")) return "square";
  if (v.startsWith("RAMP")) return "ramp";
  if (v.startsWith("PULS")) return "pulse";
  if (v.startsWith("NOIS")) return "noise";
  if (v.startsWith("DC")) return "dc";
  if (v.startsWith("USER") || v.startsWith("ARB")) return "arbitrary";
  return "sine";
}

function decodeImpedance(raw: string): SignalGeneratorOutputImpedance {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("INF") || v === "HZ" || v.startsWith("HIGH")) return "highZ";
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 1000 ? "highZ" : "50ohm";
}

function decodeModulationType(
  raw: string,
): SignalGeneratorModulationConfig["type"] {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("FM")) return "fm";
  if (v.startsWith("PWM")) return "pwm";
  if (v.startsWith("PM")) return "pm";
  if (v.startsWith("FSK")) return "fsk";
  if (v.startsWith("ASK")) return "ask";
  if (v.startsWith("PSK")) return "psk";
  return "am";
}

function encodeModulationType(type: SignalGeneratorModulationConfig["type"]): string {
  return type.toUpperCase();
}

function decodeModulationWaveform(
  raw: string,
): SignalGeneratorModulationConfig["modulatingWaveform"] {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("SQU")) return "square";
  if (v.startsWith("TRI")) return "triangle";
  if (v.startsWith("RAMP")) return "ramp";
  if (v.startsWith("NOIS")) return "noise";
  return "sine";
}

function encodeModulationWaveform(
  wave: SignalGeneratorModulationConfig["modulatingWaveform"],
): string {
  switch (wave) {
    case "sine":
      return "SIN";
    case "square":
      return "SQU";
    case "triangle":
      return "TRI";
    case "ramp":
      return "RAMP";
    case "noise":
      return "NOIS";
  }
}

function decodeSweepTrigger(
  raw: string,
): SignalGeneratorSweepConfig["trigger"] {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("EXT")) return "external";
  if (v.startsWith("MAN") || v.startsWith("BUS")) return "manual";
  return "immediate";
}

function decodeBurstTrigger(
  raw: string,
): SignalGeneratorBurstConfig["trigger"] {
  return decodeSweepTrigger(raw) as SignalGeneratorBurstConfig["trigger"];
}

function encodeTrigger(
  trigger:
    | SignalGeneratorBurstConfig["trigger"]
    | SignalGeneratorSweepConfig["trigger"],
): string {
  switch (trigger) {
    case "external":
      return "EXT";
    case "manual":
      return "MAN";
    case "immediate":
      return "IMMediate";
  }
}

function decodeBurstMode(raw: string): SignalGeneratorBurstConfig["mode"] {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("GAT")) return "gated";
  if (v.startsWith("NCYC") || v.startsWith("N CYC")) return "nCycle";
  return "triggered";
}

function encodeBurstMode(mode: SignalGeneratorBurstConfig["mode"]): string {
  switch (mode) {
    case "gated":
      return "GATed";
    case "nCycle":
      return "NCYCles";
    case "triggered":
      return "TRIGgered";
  }
}

/**
 * Convert samples into signed-16-bit, native-endian values suitable for the
 * DG800/DG900 `DATA:DAC16` binary block. Float inputs are assumed to be
 * normalised to ±1.0.
 */
function toInt16Samples(source: Float32Array | Int16Array): Int16Array {
  if (source instanceof Int16Array) return source;
  const out = new Int16Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, source[i] ?? 0));
    out[i] = Math.round(clamped * 32767);
  }
  return out;
}
