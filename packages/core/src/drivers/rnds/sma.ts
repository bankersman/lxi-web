import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
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
import { type SmaProfile, SMA_DEFAULT } from "./sma-profile.js";

/**
 * R&S SMA / SMB / SMBV analog + vector signal-generator driver.
 *
 * The generators expose a single RF port driven through
 * `SOURce:FREQuency` + `SOURce:POWer` (dBm). Modulation, sweep, and
 * vector-tree commands are SCPI-reachable but deferred — the driver
 * covers the minimum surface the UI needs:
 *   - Enable output via `OUTPut:STATe ON|OFF`.
 *   - Set / read frequency + amplitude (dBm under the hood; Vpp at
 *     the facade).
 *   - `*SAV` / `*RCL` drive preset slots.
 */
const SUPPORTED_WAVEFORMS: readonly SignalGeneratorWaveformType[] = ["sine"];

const DBM_OFFSET = 13.01; // 50 Ω Vpp ↔ dBm.

function vppToDbm(vpp: number): number {
  if (!Number.isFinite(vpp) || vpp <= 0) return -200;
  return 20 * Math.log10(vpp) - DBM_OFFSET;
}

function dbmToVpp(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0;
  return Math.pow(10, (dbm + DBM_OFFSET) / 20);
}

export class RndsSma implements ISignalGenerator {
  readonly kind = "signalGenerator" as const;
  readonly profile: SmaProfile;
  readonly channels: SignalGeneratorChannelsCapability;
  readonly presets: InstrumentPresetCapability;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SmaProfile = SMA_DEFAULT,
  ) {
    this.profile = profile;
    const maxVpp = dbmToVpp(profile.amplitudeMaxDbm);
    const limits: SignalGeneratorChannelLimits = {
      frequencyMaxHz: profile.frequencyMaxHz,
      amplitudeRangeVpp: { min: dbmToVpp(-130), max: maxVpp },
      offsetRangeV: { min: 0, max: 0 },
      outputImpedanceModes: ["50ohm"],
      supportedWaveforms: SUPPORTED_WAVEFORMS,
    };
    this.channels = { channels: [limits] };
    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<readonly SignalGeneratorChannelState[]> {
    return [await this.getChannelState(1)];
  }

  async getChannelState(channel: number): Promise<SignalGeneratorChannelState> {
    this.#assertChannel(channel);
    const [freqRaw, powRaw, enRaw] = await Promise.all([
      safeQuery(this.port, "SOURce:FREQuency?"),
      safeQuery(this.port, "SOURce:POWer?"),
      safeQuery(this.port, "OUTPut:STATe?"),
    ]);
    const frequencyHz = parseNumberOrZero(freqRaw);
    const dbm = parseNumberOrZero(powRaw);
    const amplitudeVpp = dbmToVpp(dbm);
    const setpoints: SignalGeneratorActualSetpoints = {
      frequencyHz,
      amplitudeVpp,
      offsetV: 0,
    };
    const limits = this.channels.channels[0]!;
    return {
      id: 1,
      label: "RF1",
      enabled: parseBool(enRaw),
      impedance: "50ohm",
      waveform: {
        type: "sine",
        frequencyHz,
        amplitudeVpp,
        offsetV: 0,
      },
      actual: setpoints,
      limits,
    };
  }

  async getChannelStatus(channel: number): Promise<SignalGeneratorActualSetpoints> {
    this.#assertChannel(channel);
    const [freqRaw, powRaw] = await Promise.all([
      safeQuery(this.port, "SOURce:FREQuency?"),
      safeQuery(this.port, "SOURce:POWer?"),
    ]);
    return {
      frequencyHz: parseNumberOrZero(freqRaw),
      amplitudeVpp: dbmToVpp(parseNumberOrZero(powRaw)),
      offsetV: 0,
    };
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(`OUTPut:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setWaveform(
    channel: number,
    config: SignalGeneratorWaveform,
  ): Promise<void> {
    this.#assertChannel(channel);
    if (config.type !== "sine") {
      throw new RangeError(
        `R&S ${this.profile.variant} exposes sine output only; use the vector-modulation sub-tree for complex waveforms`,
      );
    }
    if (config.frequencyHz < this.profile.frequencyMinHz) {
      throw new RangeError(
        `frequency ${config.frequencyHz} Hz below profile minimum ${this.profile.frequencyMinHz} Hz`,
      );
    }
    if (config.frequencyHz > this.profile.frequencyMaxHz) {
      throw new RangeError(
        `frequency ${config.frequencyHz} Hz exceeds profile ceiling ${this.profile.frequencyMaxHz} Hz`,
      );
    }
    await this.port.write(`SOURce:FREQuency ${config.frequencyHz}`);
    const dbm = vppToDbm(config.amplitudeVpp);
    if (dbm > this.profile.amplitudeMaxDbm) {
      throw new RangeError(
        `amplitude ${dbm.toFixed(2)} dBm exceeds profile ceiling ${this.profile.amplitudeMaxDbm} dBm`,
      );
    }
    await this.port.write(`SOURce:POWer ${dbm}`);
  }

  async setOutputImpedance(
    channel: number,
    mode: SignalGeneratorOutputImpedance,
  ): Promise<void> {
    this.#assertChannel(channel);
    if (mode !== "50ohm") {
      throw new RangeError(
        `R&S ${this.profile.variant} supports 50 Ω output only`,
      );
    }
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

  #assertChannel(channel: number): void {
    if (channel !== 1) {
      throw new Error(
        `R&S ${this.profile.variant} has a single RF port (channel 1)`,
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
}
