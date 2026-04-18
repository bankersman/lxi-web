import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IPowerSupply,
  PsuChannelLimits,
  PsuChannelState,
  PsuMeasurement,
  PsuPairingCapability,
  PsuPairingMode,
  PsuPresetCapability,
  PsuProtectionCapability,
  PsuProtectionKind,
  PsuProtectionState,
  PsuTrackingCapability,
} from "../../facades/power-supply.js";
import { type Dp900Profile, DP900_DEFAULT } from "./dp900-profile.js";
import { parseBool } from "./_shared/index.js";

/** Rigol DP900-series PSU driver (DP932E tested). */
export class RigolDp900 implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: Dp900Profile;
  readonly pairing: PsuPairingCapability;
  readonly tracking: PsuTrackingCapability;
  readonly protection: PsuProtectionCapability;
  readonly presets: PsuPresetCapability;

  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Dp900Profile = DP900_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = profile.channels.map((c) => c.id);

    const limits: Record<number, PsuChannelLimits> = {};
    const protectionRanges: Record<
      number,
      { readonly ovp: { min: number; max: number }; readonly ocp: { min: number; max: number } }
    > = {};
    for (const ch of profile.channels) {
      limits[ch.id] = { voltageMax: ch.voltageMax, currentMax: ch.currentMax };
      protectionRanges[ch.id] = { ovp: ch.ovpRange, ocp: ch.ocpRange };
    }
    this.#channelLimits = limits;

    // CH3 on DP932E is independent; pairing/tracking is always a subset
    // constrained to CHs that can be electrically coupled.
    this.pairing = {
      modes: profile.pairingChannels.length > 0 ? ["off", "series", "parallel"] : ["off"],
      channels: profile.pairingChannels,
    };
    this.tracking = { channels: profile.trackingChannels };
    this.protection = {
      channels: this.#channelIds,
      ranges: protectionRanges,
    };
    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<PsuChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelOutput(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`:OUTPut:STATe CH${channel},${enabled ? "ON" : "OFF"}`);
  }

  async setChannelVoltage(channel: number, volts: number): Promise<void> {
    await this.port.write(`:SOURce${channel}:VOLTage ${volts}`);
  }

  async setChannelCurrent(channel: number, amps: number): Promise<void> {
    await this.port.write(`:SOURce${channel}:CURRent ${amps}`);
  }

  async getPairingMode(): Promise<PsuPairingMode> {
    const raw = await this.port.query(":OUTPut:PAIR?");
    return parsePairingMode(raw);
  }

  async setPairingMode(mode: PsuPairingMode): Promise<void> {
    await this.port.write(`:OUTPut:PAIR ${encodePairingMode(mode)}`);
  }

  async getTracking(): Promise<boolean> {
    const raw = await this.port.query(":OUTPut:TRACk?");
    return parseBool(raw);
  }

  async setTracking(enabled: boolean): Promise<void> {
    await this.port.write(`:OUTPut:TRACk ${enabled ? "ON" : "OFF"}`);
  }

  async getProtection(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<PsuProtectionState> {
    const prefix = protectionPrefix(kind);
    const tag = `CH${channel}`;
    const [stateRaw, levelRaw, trippedRaw] = await Promise.all([
      this.port.query(`${prefix}? ${tag}`),
      this.port.query(`${prefix}:VALue? ${tag}`),
      this.port.query(`${prefix}:QUES? ${tag}`),
    ]);
    const range =
      this.protection.ranges[channel]?.[kind] ??
      (kind === "ovp"
        ? { min: 0.001, max: 33 }
        : { min: 0.001, max: 3.3 });
    return {
      enabled: parseBool(stateRaw),
      level: Number.parseFloat(levelRaw) || 0,
      tripped: parseBool(trippedRaw),
      range,
    };
  }

  async setProtectionEnabled(
    channel: number,
    kind: PsuProtectionKind,
    enabled: boolean,
  ): Promise<void> {
    const prefix = protectionPrefix(kind);
    await this.port.write(`${prefix} CH${channel},${enabled ? "ON" : "OFF"}`);
  }

  async setProtectionLevel(
    channel: number,
    kind: PsuProtectionKind,
    level: number,
  ): Promise<void> {
    const prefix = protectionPrefix(kind);
    await this.port.write(`${prefix}:VALue CH${channel},${level}`);
  }

  async clearProtectionTrip(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<void> {
    const prefix = protectionPrefix(kind);
    await this.port.write(`${prefix}:CLEar CH${channel}`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    const results = await Promise.all(
      Array.from({ length: this.presets.slots }, (_, slot) =>
        this.port.query(`:MEMory:VALid? RIGOL${slot}.RSF`),
      ),
    );
    return results.map(parseBool);
  }

  async savePreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot}`);
  }

  async measureChannel(channel: number): Promise<PsuMeasurement> {
    const raw = await this.port.query(`:MEASure:ALL? CH${channel}`);
    const parts = raw.trim().split(",").map((s) => Number.parseFloat(s.trim()));
    const voltage = parts[0] ?? 0;
    const current = parts[1] ?? 0;
    const power = parts[2] ?? voltage * current;
    return {
      channel,
      voltage,
      current,
      power,
      measuredAt: Date.now(),
    };
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    const [setV, setI, measured, outState] = await Promise.all([
      this.port.query(`:SOURce${id}:VOLTage?`),
      this.port.query(`:SOURce${id}:CURRent?`),
      this.port.query(`:MEASure:ALL? CH${id}`),
      this.port.query(`:OUTPut:STATe? CH${id}`),
    ]);
    const measuredParts = measured.trim().split(",").map((s) => Number.parseFloat(s));
    return {
      id,
      label: `CH${id}`,
      setVoltage: Number.parseFloat(setV),
      setCurrent: Number.parseFloat(setI),
      measuredVoltage: measuredParts[0] ?? 0,
      measuredCurrent: measuredParts[1] ?? 0,
      output: parseOutputState(outState),
      limits: this.#channelLimits[id] ?? { voltageMax: 30, currentMax: 3 },
    };
  }

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }
}

function parseOutputState(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "1" || v === "ON" || v.endsWith(",ON");
}

function parsePairingMode(raw: string): PsuPairingMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("SER")) return "series";
  if (v.startsWith("PAR")) return "parallel";
  return "off";
}

function encodePairingMode(mode: PsuPairingMode): string {
  switch (mode) {
    case "series":
      return "SERies";
    case "parallel":
      return "PARallel";
    default:
      return "OFF";
  }
}

function protectionPrefix(kind: PsuProtectionKind): string {
  return kind === "ovp" ? ":OUTPut:OVP" : ":OUTPut:OCP";
}
