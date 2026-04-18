import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IPowerSupply,
  PsuChannelLimits,
  PsuChannelState,
  PsuMeasurement,
  PsuPresetCapability,
  PsuProtectionCapability,
  PsuProtectionKind,
  PsuProtectionState,
} from "../../facades/power-supply.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import { type GpdProfile, GPP_DEFAULT } from "./gpp-profile.js";

/**
 * GW Instek GPP / GPD / PSW power-supply driver.
 *
 * GPP + GPD share the same channel-addressed SCPI tree:
 *   - `:CHANnel<n>:VOLTage <v>` / `:CURRent <a>`
 *   - `:OUTPut<n>:STATe ON|OFF`
 *   - `:MEASure<n>:VOLTage?` / `:MEASure<n>:CURRent?`
 *   - `:MEMory:SAVE N` / `:RECall N` (GPP only; GPD omits).
 *   - `:CHANnel<n>:PROTection:OVP|OCP:LEVel` + `:STATe` (GPP/PSW only).
 *
 * PSW switching PSUs use the single-channel `SOURce:VOLT` / `SOURce:CURR`
 * tree; we accept either dialect by probing once and caching the reply
 * shape. The profile's `family` is the hint.
 */
export class GwInstekGpp implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: GpdProfile;
  readonly protection?: PsuProtectionCapability;
  readonly presets?: PsuPresetCapability;
  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: GpdProfile = GPP_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = profile.channels.map((c) => c.id);
    const limits: Record<number, PsuChannelLimits> = {};
    const ranges: Record<
      number,
      { readonly ovp: { min: number; max: number }; readonly ocp: { min: number; max: number } }
    > = {};
    for (const ch of profile.channels) {
      limits[ch.id] = { voltageMax: ch.voltageMax, currentMax: ch.currentMax };
      ranges[ch.id] = {
        ovp: { min: 0, max: ch.voltageMax * 1.1 },
        ocp: { min: 0, max: ch.currentMax * 1.1 },
      };
    }
    this.#channelLimits = limits;
    if (profile.hasProtection) {
      this.protection = { channels: [...this.#channelIds], ranges };
    }
    if (profile.hasPresets) {
      this.presets = { slots: profile.presetSlots };
    }
  }

  async getChannels(): Promise<PsuChannelState[]> {
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelOutput(channel: number, enabled: boolean): Promise<void> {
    this.#assertChannel(channel);
    if (this.profile.family === "psw") {
      await this.port.write(`OUTPut ${enabled ? "ON" : "OFF"}`);
      return;
    }
    await this.port.write(`:OUTPut${channel}:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setChannelVoltage(channel: number, volts: number): Promise<void> {
    this.#assertChannel(channel);
    if (this.profile.family === "psw") {
      await this.port.write(`SOURce:VOLTage ${volts}`);
      return;
    }
    await this.port.write(`:CHANnel${channel}:VOLTage ${volts}`);
  }

  async setChannelCurrent(channel: number, amps: number): Promise<void> {
    this.#assertChannel(channel);
    if (this.profile.family === "psw") {
      await this.port.write(`SOURce:CURRent ${amps}`);
      return;
    }
    await this.port.write(`:CHANnel${channel}:CURRent ${amps}`);
  }

  async measureChannel(channel: number): Promise<PsuMeasurement> {
    this.#assertChannel(channel);
    const [vRaw, iRaw] = await Promise.all([
      this.#queryVoltage(channel, true),
      this.#queryCurrent(channel, true),
    ]);
    const voltage = parseNumberOrZero(vRaw);
    const current = parseNumberOrZero(iRaw);
    return {
      channel,
      voltage,
      current,
      power: voltage * current,
      measuredAt: Date.now(),
    };
  }

  async getProtection(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<PsuProtectionState> {
    if (!this.protection) {
      throw new Error(
        `GW Instek ${this.profile.variant} does not expose protection`,
      );
    }
    this.#assertChannel(channel);
    const base = this.profile.family === "psw" ? "SOURce" : `:CHANnel${channel}`;
    const kindTok = kind.toUpperCase();
    const [levelRaw, stateRaw, trippedRaw] = await Promise.all([
      safeQuery(this.port, `${base}:${kindTok}:LEVel?`),
      safeQuery(this.port, `${base}:${kindTok}:STATe?`),
      safeQuery(this.port, `${base}:${kindTok}:TRIPped?`),
    ]);
    const range = this.protection.ranges[channel]?.[kind] ?? { min: 0, max: 0 };
    return {
      enabled: parseBool(stateRaw),
      level: parseNumberOrZero(levelRaw),
      tripped: parseBool(trippedRaw),
      range,
    };
  }

  async setProtectionEnabled(
    channel: number,
    kind: PsuProtectionKind,
    enabled: boolean,
  ): Promise<void> {
    if (!this.protection) {
      throw new Error(
        `GW Instek ${this.profile.variant} does not expose protection`,
      );
    }
    this.#assertChannel(channel);
    const base = this.profile.family === "psw" ? "SOURce" : `:CHANnel${channel}`;
    await this.port.write(
      `${base}:${kind.toUpperCase()}:STATe ${enabled ? "ON" : "OFF"}`,
    );
  }

  async setProtectionLevel(
    channel: number,
    kind: PsuProtectionKind,
    level: number,
  ): Promise<void> {
    if (!this.protection) {
      throw new Error(
        `GW Instek ${this.profile.variant} does not expose protection`,
      );
    }
    this.#assertChannel(channel);
    const base = this.profile.family === "psw" ? "SOURce" : `:CHANnel${channel}`;
    await this.port.write(`${base}:${kind.toUpperCase()}:LEVel ${level}`);
  }

  async clearProtectionTrip(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<void> {
    if (!this.protection) return;
    this.#assertChannel(channel);
    const base = this.profile.family === "psw" ? "SOURce" : `:CHANnel${channel}`;
    await this.port.write(`${base}:${kind.toUpperCase()}:CLEar`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    if (!this.presets) return [];
    return Array.from({ length: this.presets.slots }, () => true);
  }

  async savePreset(slot: number): Promise<void> {
    if (!this.presets) {
      throw new Error(
        `GW Instek ${this.profile.variant} does not expose preset memory`,
      );
    }
    this.#assertSlot(slot);
    await this.port.write(`:MEMory:SAVE ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    if (!this.presets) {
      throw new Error(
        `GW Instek ${this.profile.variant} does not expose preset memory`,
      );
    }
    this.#assertSlot(slot);
    await this.port.write(`:MEMory:RECall ${slot}`);
  }

  async #queryVoltage(channel: number, measure: boolean): Promise<string> {
    if (this.profile.family === "psw") {
      return safeQuery(
        this.port,
        measure ? "MEASure:VOLTage?" : "SOURce:VOLTage?",
      );
    }
    return safeQuery(
      this.port,
      measure
        ? `:MEASure${channel}:VOLTage?`
        : `:CHANnel${channel}:VOLTage?`,
    );
  }

  async #queryCurrent(channel: number, measure: boolean): Promise<string> {
    if (this.profile.family === "psw") {
      return safeQuery(
        this.port,
        measure ? "MEASure:CURRent?" : "SOURce:CURRent?",
      );
    }
    return safeQuery(
      this.port,
      measure
        ? `:MEASure${channel}:CURRent?`
        : `:CHANnel${channel}:CURRent?`,
    );
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    const [setV, setI, measV, measI, outRaw] = await Promise.all([
      this.#queryVoltage(id, false),
      this.#queryCurrent(id, false),
      this.#queryVoltage(id, true),
      this.#queryCurrent(id, true),
      safeQuery(
        this.port,
        this.profile.family === "psw"
          ? "OUTPut?"
          : `:OUTPut${id}:STATe?`,
      ),
    ]);
    const label = this.profile.channels.find((c) => c.id === id)?.label ?? `CH${id}`;
    return {
      id,
      label,
      setVoltage: parseNumberOrZero(setV),
      setCurrent: parseNumberOrZero(setI),
      measuredVoltage: parseNumberOrZero(measV),
      measuredCurrent: parseNumberOrZero(measI),
      output: parseBool(outRaw),
      limits: this.#channelLimits[id] ?? { voltageMax: 30, currentMax: 3 },
    };
  }

  #assertChannel(channel: number): void {
    if (!this.#channelIds.includes(channel)) {
      throw new Error(
        `GW Instek ${this.profile.variant} does not have channel ${channel}`,
      );
    }
  }

  #assertSlot(slot: number): void {
    const slots = this.presets?.slots ?? 0;
    if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${slots - 1}`,
      );
    }
  }
}
