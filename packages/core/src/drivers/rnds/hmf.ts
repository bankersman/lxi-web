import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { OutputKillResult } from "../../facades/output-kill.js";
import { runSgDisableAll } from "../../facades/output-kill.js";
import type {
  ISignalGenerator,
  SignalGeneratorActualSetpoints,
  SignalGeneratorChannelLimits,
  SignalGeneratorChannelState,
  SignalGeneratorChannelsCapability,
  SignalGeneratorOutputImpedance,
  SignalGeneratorWaveform,
  SignalGeneratorWaveformType,
} from "../../facades/signal-generator.js";
import type { InstrumentPresetCapability } from "../../facades/multimeter.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import { type HmfProfile, HMF_DEFAULT } from "./hmf-profile.js";

const SUPPORTED_WAVEFORMS: readonly SignalGeneratorWaveformType[] = [
  "sine",
  "square",
  "ramp",
  "pulse",
  "noise",
  "dc",
];

const WAVEFORM_TO_SCPI: Record<SignalGeneratorWaveformType, string> = {
  sine: "SIN",
  square: "SQU",
  ramp: "RAMP",
  pulse: "PULS",
  noise: "NOIS",
  dc: "DC",
  arbitrary: "ARB",
};

const SCPI_TO_WAVEFORM: Record<string, SignalGeneratorWaveformType> = {
  SIN: "sine",
  SINE: "sine",
  SQU: "square",
  SQUARE: "square",
  RAMP: "ramp",
  TRI: "ramp",
  PULS: "pulse",
  PULSE: "pulse",
  NOIS: "noise",
  NOISE: "noise",
  DC: "dc",
  ARB: "arbitrary",
  USER: "arbitrary",
};

/**
 * Hameg-heritage HMF2500 / HMC804x function-generator driver.
 *
 * Commands track the SCPI-99 `SOURce<n>:FUNCtion`, `:FREQuency`,
 * `:VOLTage`, `:VOLTage:OFFSet`, `OUTPut<n>:STATe`, `OUTPut<n>:LOAD`
 * tree. Multi-channel HMC units route per-channel via the `<n>`
 * suffix; the HMF is single-channel so the suffix is omitted for
 * channel 1 commands (the firmware accepts either form).
 */
export class RndsHmf implements ISignalGenerator {
  readonly kind = "signalGenerator" as const;
  readonly profile: HmfProfile;
  readonly channels: SignalGeneratorChannelsCapability;
  readonly presets: InstrumentPresetCapability;
  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: HmfProfile = HMF_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channelCount }, (_, i) => i + 1);
    const limits: SignalGeneratorChannelLimits = {
      frequencyMaxHz: profile.frequencyMaxHz,
      amplitudeRangeVpp: { min: 0.01, max: profile.amplitudeMaxVpp },
      offsetRangeV: { min: -5, max: 5 },
      outputImpedanceModes: ["50ohm", "highZ"],
      supportedWaveforms: SUPPORTED_WAVEFORMS,
    };
    this.channels = {
      channels: Array.from({ length: profile.channelCount }, () => limits),
    };
    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<readonly SignalGeneratorChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.getChannelState(id)));
  }

  async getChannelState(channel: number): Promise<SignalGeneratorChannelState> {
    const src = `SOURce${channel}`;
    const out = `OUTPut${channel}`;
    const [fnRaw, freqRaw, ampRaw, offsetRaw, enRaw, impRaw] = await Promise.all([
      safeQuery(this.port, `${src}:FUNCtion?`),
      safeQuery(this.port, `${src}:FREQuency?`),
      safeQuery(this.port, `${src}:VOLTage?`),
      safeQuery(this.port, `${src}:VOLTage:OFFSet?`),
      safeQuery(this.port, `${out}:STATe?`),
      safeQuery(this.port, `${out}:LOAD?`),
    ]);
    const type = decodeWaveformType(fnRaw);
    const frequencyHz = parseNumberOrZero(freqRaw);
    const amplitudeVpp = parseNumberOrZero(ampRaw);
    const offsetV = parseNumberOrZero(offsetRaw);
    const waveform: SignalGeneratorWaveform =
      type === "noise"
        ? { type: "noise", amplitudeVpp, offsetV }
        : type === "dc"
          ? { type: "dc", offsetV }
          : { type, frequencyHz, amplitudeVpp, offsetV };
    const limits = this.channels.channels[channel - 1] ?? this.channels.channels[0]!;
    const setpoints: SignalGeneratorActualSetpoints = {
      frequencyHz,
      amplitudeVpp,
      offsetV,
    };
    return {
      id: channel,
      label: `CH${channel}`,
      enabled: parseBool(enRaw),
      impedance: decodeImpedance(impRaw),
      waveform,
      actual: setpoints,
      limits,
    };
  }

  async getChannelStatus(channel: number): Promise<SignalGeneratorActualSetpoints> {
    const src = `SOURce${channel}`;
    const [freqRaw, ampRaw, offsetRaw] = await Promise.all([
      safeQuery(this.port, `${src}:FREQuency?`),
      safeQuery(this.port, `${src}:VOLTage?`),
      safeQuery(this.port, `${src}:VOLTage:OFFSet?`),
    ]);
    return {
      frequencyHz: parseNumberOrZero(freqRaw),
      amplitudeVpp: parseNumberOrZero(ampRaw),
      offsetV: parseNumberOrZero(offsetRaw),
    };
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`OUTPut${channel}:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setWaveform(
    channel: number,
    config: SignalGeneratorWaveform,
  ): Promise<void> {
    const limits = this.channels.channels[channel - 1] ?? this.channels.channels[0]!;
    if (!limits.supportedWaveforms.includes(config.type)) {
      throw new RangeError(
        `HMF driver does not support waveform ${config.type} on this profile`,
      );
    }
    const src = `SOURce${channel}`;
    await this.port.write(`${src}:FUNCtion ${WAVEFORM_TO_SCPI[config.type]}`);
    if (config.type !== "dc" && config.type !== "noise") {
      await this.port.write(`${src}:FREQuency ${config.frequencyHz}`);
    }
    if (config.type !== "dc") {
      await this.port.write(`${src}:VOLTage ${config.amplitudeVpp}`);
    }
    await this.port.write(`${src}:VOLTage:OFFSet ${config.offsetV}`);
  }

  async setOutputImpedance(
    channel: number,
    mode: SignalGeneratorOutputImpedance,
  ): Promise<void> {
    const value = mode === "highZ" ? "INFinity" : "50";
    await this.port.write(`OUTPut${channel}:LOAD ${value}`);
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

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }

  async disableAllOutputs(): Promise<OutputKillResult> {
    return runSgDisableAll(this);
  }
}

function decodeWaveformType(raw: string): SignalGeneratorWaveformType {
  const v = raw.trim().replace(/^"|"$/g, "").toUpperCase();
  return SCPI_TO_WAVEFORM[v] ?? "sine";
}

function decodeImpedance(raw: string): SignalGeneratorOutputImpedance {
  const v = raw.trim().toUpperCase();
  if (!v) return "50ohm";
  if (v === "INF" || v === "INFINITY" || v === "HIGHZ" || v === "9.9E+37") {
    return "highZ";
  }
  const n = Number.parseFloat(v);
  if (Number.isFinite(n) && n > 1e5) return "highZ";
  return "50ohm";
}
