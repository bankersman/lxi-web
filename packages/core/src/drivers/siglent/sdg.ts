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
import { type SdgProfile, SDG_DEFAULT } from "./sdg-profile.js";
import { parseNumberOrZero } from "./_shared/index.js";

const SUPPORTED_WAVEFORMS: readonly SignalGeneratorWaveformType[] = [
  "sine",
  "square",
  "ramp",
  "pulse",
  "noise",
  "dc",
  "arbitrary",
];

const WAVEFORM_TO_BSWV: Record<SignalGeneratorWaveformType, string> = {
  sine: "SINE",
  square: "SQUARE",
  ramp: "RAMP",
  pulse: "PULSE",
  noise: "NOISE",
  dc: "DC",
  arbitrary: "ARB",
};

const BSWV_TO_WAVEFORM: Record<string, SignalGeneratorWaveformType> = {
  SINE: "sine",
  SQUARE: "square",
  RAMP: "ramp",
  PULSE: "pulse",
  NOISE: "noise",
  DC: "dc",
  ARB: "arbitrary",
};

/**
 * Siglent SDG signal-generator driver. Covers SDG1000X / SDG2000X /
 * SDG6000X families via a single SCPI dialect — the legacy
 * `Cn:BSWV WVTP,SINE,FRQ,1000,AMP,1,OFST,0` form works on every
 * SDG generation and is the documented cross-family command in
 * Siglent's programming guide.
 *
 * First-pass Preview entry: core waveform setup, channel toggle,
 * output impedance, query-back round-trip. Modulation, sweep, burst,
 * and arbitrary upload are intentionally deferred to community
 * hardware reports — the capability objects are omitted so consumers
 * see the facts on the ground.
 */
export class SiglentSdg implements ISignalGenerator {
  readonly kind = "signalGenerator" as const;
  readonly profile: SdgProfile;
  readonly channels: SignalGeneratorChannelsCapability;
  readonly presets: InstrumentPresetCapability;

  readonly #channelIds: readonly number[];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SdgProfile = SDG_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = Array.from({ length: profile.channelCount }, (_, i) => i + 1);
    const limits: SignalGeneratorChannelLimits = {
      frequencyMaxHz: profile.frequencyMaxHz,
      amplitudeRangeVpp: { min: 0.002, max: profile.amplitudeMaxVpp },
      offsetRangeV: { min: -10, max: 10 },
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
    const [outpRaw, bswvRaw] = await Promise.all([
      this.port.query(`C${channel}:OUTP?`),
      this.port.query(`C${channel}:BSWV?`),
    ]);
    const outp = parseKvPairs(outpRaw);
    const bswv = parseKvPairs(bswvRaw);
    const waveform = decodeWaveform(bswv);
    const setpoints: SignalGeneratorActualSetpoints = {
      frequencyHz: parseNumericValue(bswv.get("FRQ")) ?? 0,
      amplitudeVpp: parseNumericValue(bswv.get("AMP")) ?? 0,
      offsetV: parseNumericValue(bswv.get("OFST")) ?? 0,
    };
    const limits = this.channels.channels[channel - 1] ?? this.channels.channels[0]!;
    return {
      id: channel,
      label: `CH${channel}`,
      enabled: isOn(outp.get("")),
      impedance: decodeImpedance(outp.get("LOAD")),
      waveform,
      actual: setpoints,
      limits,
    };
  }

  async getChannelStatus(channel: number): Promise<SignalGeneratorActualSetpoints> {
    const raw = await this.port.query(`C${channel}:BSWV?`);
    const bswv = parseKvPairs(raw);
    return {
      frequencyHz: parseNumericValue(bswv.get("FRQ")) ?? 0,
      amplitudeVpp: parseNumericValue(bswv.get("AMP")) ?? 0,
      offsetV: parseNumericValue(bswv.get("OFST")) ?? 0,
    };
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`C${channel}:OUTP ${enabled ? "ON" : "OFF"}`);
  }

  async setWaveform(channel: number, config: SignalGeneratorWaveform): Promise<void> {
    const limits = this.channels.channels[channel - 1] ?? this.channels.channels[0]!;
    this.#validate(config, limits);
    const fragments: string[] = [`WVTP,${WAVEFORM_TO_BSWV[config.type]}`];
    if (config.type !== "noise" && config.type !== "dc") {
      fragments.push(`FRQ,${config.frequencyHz}`);
    }
    if (config.type !== "dc") {
      fragments.push(`AMP,${config.amplitudeVpp}`);
    }
    fragments.push(`OFST,${config.offsetV}`);
    if (config.type === "square" && config.dutyPct !== undefined) {
      fragments.push(`DUTY,${config.dutyPct}`);
    }
    if (config.type === "ramp" && config.symmetryPct !== undefined) {
      fragments.push(`SYM,${config.symmetryPct}`);
    }
    if (config.type === "pulse" && config.widthS !== undefined) {
      fragments.push(`WIDTH,${config.widthS}`);
    }
    if ("phaseDeg" in config && config.phaseDeg !== undefined) {
      fragments.push(`PHSE,${config.phaseDeg}`);
    }
    await this.port.write(`C${channel}:BSWV ${fragments.join(",")}`);
  }

  async setOutputImpedance(
    channel: number,
    impedance: SignalGeneratorOutputImpedance,
  ): Promise<void> {
    const value = impedance === "highZ" ? "HZ" : "50";
    await this.port.write(`C${channel}:OUTP LOAD,${value}`);
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

  #validate(
    config: SignalGeneratorWaveform,
    limits: SignalGeneratorChannelLimits,
  ): void {
    if (!limits.supportedWaveforms.includes(config.type)) {
      throw new RangeError(`SDG driver does not support waveform ${config.type}`);
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
}

/**
 * Parse a Siglent "KEY,VALUE,KEY,VALUE" tail. The first token (before
 * the first space) is the subsystem echo we strip off; the remainder
 * is the comma-separated KV list. Empty keys are allowed — we map them
 * to the empty string so the caller can still look up positional
 * values like the leading `ON` / `OFF` on `C1:OUTP?`.
 */
function parseKvPairs(raw: string): Map<string, string> {
  const trimmed = raw.trim();
  const spaceIdx = trimmed.indexOf(" ");
  const tail = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);
  const tokens = tail.split(",").map((t) => t.trim());
  const map = new Map<string, string>();
  let i = 0;
  if (tokens.length > 0 && (tokens[0] === "ON" || tokens[0] === "OFF")) {
    map.set("", tokens[0]);
    i = 1;
  }
  while (i + 1 < tokens.length) {
    const key = tokens[i]!;
    const value = tokens[i + 1] ?? "";
    map.set(key, value);
    i += 2;
  }
  return map;
}

/** Parse a numeric string that may have a unit suffix (HZ, V, S, %). */
function parseNumericValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  const unit = raw.slice(match[0].length).toUpperCase();
  if (unit.startsWith("MHZ")) return n * 1e6;
  if (unit.startsWith("KHZ")) return n * 1e3;
  if (unit.startsWith("MV")) return n * 1e-3;
  if (unit.startsWith("US")) return n * 1e-6;
  if (unit.startsWith("MS")) return n * 1e-3;
  return n;
}

function decodeWaveform(bswv: Map<string, string>): SignalGeneratorWaveform {
  const rawType = (bswv.get("WVTP") ?? "SINE").trim().toUpperCase();
  const type = BSWV_TO_WAVEFORM[rawType] ?? "sine";
  const frequencyHz = parseNumericValue(bswv.get("FRQ")) ?? 0;
  const amplitudeVpp = parseNumericValue(bswv.get("AMP")) ?? 0;
  const offsetV = parseNumericValue(bswv.get("OFST")) ?? 0;
  const phaseDeg = parseNumericValue(bswv.get("PHSE")) ?? undefined;
  switch (type) {
    case "noise":
      return { type: "noise", amplitudeVpp, offsetV };
    case "dc":
      return { type: "dc", offsetV };
    case "square":
      return {
        type: "square",
        frequencyHz,
        amplitudeVpp,
        offsetV,
        phaseDeg,
        dutyPct: parseNumericValue(bswv.get("DUTY")) ?? undefined,
      };
    case "ramp":
      return {
        type: "ramp",
        frequencyHz,
        amplitudeVpp,
        offsetV,
        phaseDeg,
        symmetryPct: parseNumericValue(bswv.get("SYM")) ?? undefined,
      };
    case "pulse":
      return {
        type: "pulse",
        frequencyHz,
        amplitudeVpp,
        offsetV,
        phaseDeg,
        widthS: parseNumericValue(bswv.get("WIDTH")) ?? undefined,
      };
    case "arbitrary":
      return { type: "arbitrary", frequencyHz, amplitudeVpp, offsetV, phaseDeg, sampleId: "" };
    default:
      return { type: "sine", frequencyHz, amplitudeVpp, offsetV, phaseDeg };
  }
}

function decodeImpedance(raw: string | undefined): SignalGeneratorOutputImpedance {
  if (!raw) return "50ohm";
  const v = raw.trim().toUpperCase();
  if (v === "HZ" || v === "HIGHZ" || v === "INF") return "highZ";
  return "50ohm";
}

function isOn(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toUpperCase() === "ON" || raw.trim() === "1";
}
