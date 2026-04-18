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
import { parseBool, parseNumberOrZero } from "./_shared/index.js";
import { type Trueform33500Profile, T33500_DEFAULT } from "./3350x-profile.js";

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
  noise: "NOIS",
  dc: "DC",
  arbitrary: "ARB",
};

const SCPI_TO_WAVEFORM: Record<string, SignalGeneratorWaveformType> = {
  SIN: "sine",
  SQU: "square",
  RAMP: "ramp",
  PULS: "pulse",
  NOIS: "noise",
  DC: "dc",
  ARB: "arbitrary",
  TRI: "ramp",
  PRBS: "arbitrary",
};

/**
 * Keysight Trueform 33500B / 33600A signal-generator driver.
 *
 * SCPI dialect — Keysight Trueform Programmer's Reference. Clean
 * SCPI-2000 standard; channel selection uses the `SOURce<n>:` prefix
 * (or bare `SOURce:` for channel 1). Output-side commands use
 * `OUTPut<n>:`.
 *
 * Commands used:
 *   - `SOURce<n>:FUNCtion SIN|SQU|RAMP|PULS|NOIS|DC|ARB`.
 *   - `SOURce<n>:FREQuency <Hz>`, `:VOLTage <Vpp>`, `:VOLTage:OFFSet <V>`,
 *     `:PHASe <deg>`.
 *   - Waveform-specific modifiers: `FUNCtion:SQUare:DCYCle`,
 *     `FUNCtion:RAMP:SYMMetry`, `FUNCtion:PULSe:WIDTh`.
 *   - `OUTPut<n>[:STATe] ON/OFF` toggles the output relay.
 *   - `OUTPut<n>:LOAD <50|INF>` reflects 50 Ω vs high-Z.
 *
 * First-pass Preview surface: waveform configuration + output control
 * + impedance + preset slots. Sweep / burst / modulation / arbitrary
 * upload are valid on the hardware but layered on top of this class
 * once hardware reports land.
 */
export class KeysightTrueform33500 implements ISignalGenerator {
  readonly kind = "signalGenerator" as const;
  readonly profile: Trueform33500Profile;
  readonly channels: SignalGeneratorChannelsCapability;
  readonly presets: InstrumentPresetCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Trueform33500Profile = T33500_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channelCount }, (_, i) => i + 1);
    const limits: SignalGeneratorChannelLimits = {
      frequencyMaxHz: profile.frequencyMaxHz,
      amplitudeRangeVpp: { min: 0.001, max: profile.amplitudeMaxVpp },
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
    const [fnRaw, freqRaw, ampRaw, offsetRaw, phaseRaw, enRaw, loadRaw] = await Promise.all([
      this.port.query(`${src}:FUNCtion?`),
      this.port.query(`${src}:FREQuency?`),
      this.port.query(`${src}:VOLTage?`),
      this.port.query(`${src}:VOLTage:OFFSet?`),
      safeQuery(this.port, `${src}:PHASe?`),
      this.port.query(`${out}:STATe?`),
      safeQuery(this.port, `${out}:LOAD?`),
    ]);
    const type = decodeWaveformType(fnRaw);
    const frequencyHz = parseNumberOrZero(freqRaw);
    const amplitudeVpp = parseNumberOrZero(ampRaw);
    const offsetV = parseNumberOrZero(offsetRaw);
    const phaseDeg = phaseRaw ? parseNumberOrZero(phaseRaw) : undefined;
    const waveform = await this.#hydrateWaveform(channel, type, {
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
      impedance: decodeImpedance(loadRaw),
      waveform,
      actual: setpoints,
      limits,
    };
  }

  async getChannelStatus(channel: number): Promise<SignalGeneratorActualSetpoints> {
    const src = `SOURce${channel}`;
    const [freqRaw, ampRaw, offsetRaw] = await Promise.all([
      this.port.query(`${src}:FREQuency?`),
      this.port.query(`${src}:VOLTage?`),
      this.port.query(`${src}:VOLTage:OFFSet?`),
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
      await this.port.write(`${src}:FUNCtion:SQUare:DCYCle ${config.dutyPct}`);
    }
    if (config.type === "ramp" && config.symmetryPct !== undefined) {
      await this.port.write(`${src}:FUNCtion:RAMP:SYMMetry ${config.symmetryPct}`);
    }
    if (config.type === "pulse" && config.widthS !== undefined) {
      await this.port.write(`${src}:FUNCtion:PULSe:WIDTh ${config.widthS}`);
    }
    if ("phaseDeg" in config && config.phaseDeg !== undefined) {
      await this.port.write(`${src}:PHASe ${config.phaseDeg}`);
    }
  }

  async setOutputImpedance(
    channel: number,
    impedance: SignalGeneratorOutputImpedance,
  ): Promise<void> {
    // Trueform uses numeric ohms or `INFinity` for high-Z.
    const value = impedance === "highZ" ? "INFinity" : "50";
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

  async #hydrateWaveform(
    channel: number,
    type: SignalGeneratorWaveformType,
    base: {
      readonly frequencyHz: number;
      readonly amplitudeVpp: number;
      readonly offsetV: number;
      readonly phaseDeg: number | undefined;
    },
  ): Promise<SignalGeneratorWaveform> {
    const src = `SOURce${channel}`;
    switch (type) {
      case "noise":
        return { type: "noise", amplitudeVpp: base.amplitudeVpp, offsetV: base.offsetV };
      case "dc":
        return { type: "dc", offsetV: base.offsetV };
      case "square": {
        const duty = await safeQuery(this.port, `${src}:FUNCtion:SQUare:DCYCle?`);
        return {
          type: "square",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
          dutyPct: duty ? parseNumberOrZero(duty) : undefined,
        };
      }
      case "ramp": {
        const sym = await safeQuery(this.port, `${src}:FUNCtion:RAMP:SYMMetry?`);
        return {
          type: "ramp",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
          symmetryPct: sym ? parseNumberOrZero(sym) : undefined,
        };
      }
      case "pulse": {
        const width = await safeQuery(this.port, `${src}:FUNCtion:PULSe:WIDTh?`);
        return {
          type: "pulse",
          frequencyHz: base.frequencyHz,
          amplitudeVpp: base.amplitudeVpp,
          offsetV: base.offsetV,
          phaseDeg: base.phaseDeg,
          widthS: width ? parseNumberOrZero(width) : undefined,
        };
      }
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
      throw new RangeError(`Trueform driver does not support waveform ${config.type}`);
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
      if (config.frequencyHz <= 0) {
        throw new RangeError("frequency must be > 0 Hz");
      }
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

function decodeImpedance(raw: string | null): SignalGeneratorOutputImpedance {
  if (!raw) return "50ohm";
  const v = raw.trim().toUpperCase();
  if (v === "INF" || v === "INFinity".toUpperCase() || v === "HIGHZ" || v === "9.9E+37") {
    return "highZ";
  }
  const n = Number.parseFloat(v);
  if (Number.isFinite(n) && n > 1e5) return "highZ";
  return "50ohm";
}

async function safeQuery(port: ScpiPort, cmd: string): Promise<string | null> {
  try {
    return await port.query(cmd);
  } catch {
    return null;
  }
}
