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
import { type AfgProfile, AFG_DEFAULT } from "./afg-profile.js";

const SUPPORTED_WAVEFORMS: readonly SignalGeneratorWaveformType[] = [
  "sine",
  "square",
  "ramp",
  "pulse",
  "noise",
  "dc",
  "arbitrary",
];

const WAVEFORM_TO_SCPI: Record<SignalGeneratorWaveformType, string> = {
  sine: "SIN",
  square: "SQU",
  ramp: "RAMP",
  pulse: "PULS",
  // Tektronix AFG uses `PRNoise` for pseudorandom noise.
  noise: "PRNoise",
  dc: "DC",
  // Arbitrary playback requires `FUNCtion EMEM` or `EMEMCH1` depending
  // on generation; we use `EMEM` which the 31000 firmware accepts.
  arbitrary: "EMEM",
};

const SCPI_TO_WAVEFORM: Record<string, SignalGeneratorWaveformType> = {
  SIN: "sine",
  SQU: "square",
  RAMP: "ramp",
  PULS: "pulse",
  PRN: "noise",
  PRNOISE: "noise",
  DC: "dc",
  EMEM: "arbitrary",
  EMEMCH1: "arbitrary",
  EMEMCH2: "arbitrary",
  ARB: "arbitrary",
  USER: "arbitrary",
};

/**
 * Tektronix AFG1000 / AFG3000C / AFG31000 signal-generator driver.
 *
 * The AFG SCPI dialect is SCPI-1999 with the same `SOURce<n>:FUNCtion`
 * shape as Keysight Trueform — the key differences are:
 *   - Noise uses `PRNoise` rather than `NOISe` on some firmware revs.
 *   - Arbitrary playback is driven by `FUNCtion EMEM` (or `EMEMCH<n>`
 *     on the AFG31000 dual-channel, where each channel has independent
 *     arbitrary memory banks).
 *   - Output impedance uses `OUTPut<n>:IMPedance` rather than
 *     `OUTPut<n>:LOAD`; high-Z is `INFinity` on modern firmware.
 *
 * Preview-status surface: waveform config + output control + impedance
 * + preset slots. Arbitrary upload, burst, sweep, and modulation are
 * SCPI-reachable but left for a follow-up once community reports
 * confirm the exact command variants per family.
 */
export class TektronixAfg implements ISignalGenerator {
  readonly kind = "signalGenerator" as const;
  readonly profile: AfgProfile;
  readonly channels: SignalGeneratorChannelsCapability;
  readonly presets: InstrumentPresetCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: AfgProfile = AFG_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channelCount }, (_, i) => i + 1);
    const limits: SignalGeneratorChannelLimits = {
      frequencyMaxHz: profile.frequencyMaxHz,
      amplitudeRangeVpp: { min: 0.002, max: profile.amplitudeMaxVpp },
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
    const [fnRaw, freqRaw, ampRaw, offsetRaw, phaseRaw, enRaw, impRaw] = await Promise.all([
      safeQuery(this.port, `${src}:FUNCtion?`),
      safeQuery(this.port, `${src}:FREQuency?`),
      safeQuery(this.port, `${src}:VOLTage?`),
      safeQuery(this.port, `${src}:VOLTage:OFFSet?`),
      safeQuery(this.port, `${src}:PHASe?`),
      safeQuery(this.port, `${out}:STATe?`),
      safeQuery(this.port, `${out}:IMPedance?`),
    ]);
    const type = decodeWaveformType(fnRaw);
    const frequencyHz = parseNumberOrZero(freqRaw);
    const amplitudeVpp = parseNumberOrZero(ampRaw);
    const offsetV = parseNumberOrZero(offsetRaw);
    const phaseDeg = phaseRaw ? parseNumberOrZero(phaseRaw) : undefined;
    const waveform = this.#hydrateWaveform(type, {
      frequencyHz,
      amplitudeVpp,
      offsetV,
      phaseDeg,
    });
    const setpoints: SignalGeneratorActualSetpoints = { frequencyHz, amplitudeVpp, offsetV };
    const limits = this.channels.channels[channel - 1] ?? this.channels.channels[0]!;
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

  async setWaveform(channel: number, config: SignalGeneratorWaveform): Promise<void> {
    const limits = this.channels.channels[channel - 1] ?? this.channels.channels[0]!;
    this.#validate(config, limits);
    const src = `SOURce${channel}`;
    await this.port.write(`${src}:FUNCtion ${WAVEFORM_TO_SCPI[config.type]}`);
    if (config.type !== "dc" && config.type !== "noise") {
      await this.port.write(`${src}:FREQuency ${config.frequencyHz}`);
    }
    if (config.type !== "dc") {
      await this.port.write(`${src}:VOLTage ${config.amplitudeVpp}`);
    }
    await this.port.write(`${src}:VOLTage:OFFSet ${config.offsetV}`);
    if (config.type === "square" && config.dutyPct !== undefined) {
      await this.port.write(`${src}:PULSe:DCYCle ${config.dutyPct}`);
    }
    if (config.type === "pulse" && config.widthS !== undefined) {
      await this.port.write(`${src}:PULSe:WIDTh ${config.widthS}`);
    }
    if ("phaseDeg" in config && config.phaseDeg !== undefined) {
      await this.port.write(`${src}:PHASe ${config.phaseDeg}`);
    }
  }

  async setOutputImpedance(
    channel: number,
    impedance: SignalGeneratorOutputImpedance,
  ): Promise<void> {
    const value = impedance === "highZ" ? "INFinity" : "50";
    await this.port.write(`OUTPut${channel}:IMPedance ${value}`);
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

  #hydrateWaveform(
    type: SignalGeneratorWaveformType,
    base: {
      readonly frequencyHz: number;
      readonly amplitudeVpp: number;
      readonly offsetV: number;
      readonly phaseDeg: number | undefined;
    },
  ): SignalGeneratorWaveform {
    switch (type) {
      case "noise":
        return { type: "noise", amplitudeVpp: base.amplitudeVpp, offsetV: base.offsetV };
      case "dc":
        return { type: "dc", offsetV: base.offsetV };
      case "square":
        return {
          type: "square",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
        };
      case "ramp":
        return {
          type: "ramp",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
        };
      case "pulse":
        return {
          type: "pulse",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
        };
      case "arbitrary":
        return {
          type: "arbitrary",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
          sampleId: "",
        };
      default:
        return {
          type: "sine",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
        };
    }
  }

  #validate(
    config: SignalGeneratorWaveform,
    limits: SignalGeneratorChannelLimits,
  ): void {
    if (!limits.supportedWaveforms.includes(config.type)) {
      throw new RangeError(`AFG driver does not support waveform ${config.type}`);
    }
    if (config.type !== "dc") {
      if (config.amplitudeVpp < limits.amplitudeRangeVpp.min) {
        throw new RangeError(
          `amplitude ${config.amplitudeVpp} Vpp is below the profile minimum ${limits.amplitudeRangeVpp.min} Vpp`,
        );
      }
      if (config.amplitudeVpp > limits.amplitudeRangeVpp.max) {
        throw new RangeError(
          `amplitude ${config.amplitudeVpp} Vpp exceeds the profile ceiling ${limits.amplitudeRangeVpp.max} Vpp`,
        );
      }
    }
    if (config.type !== "noise" && config.type !== "dc") {
      if (config.frequencyHz <= 0) throw new RangeError("frequency must be > 0 Hz");
      if (config.frequencyHz > limits.frequencyMaxHz) {
        throw new RangeError(
          `frequency ${config.frequencyHz} Hz exceeds the profile ceiling ${limits.frequencyMaxHz} Hz`,
        );
      }
    }
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
