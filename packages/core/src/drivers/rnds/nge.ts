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
import { type NgeProfile, NGE_DEFAULT } from "./nge-profile.js";

/**
 * Rohde & Schwarz NGE / NGL / NGM / NGP / NGU / HMP / HMC power-supply
 * driver. All families share the same SCPI tree:
 *   - `INSTrument:SELect OUT<n>` hops between rails.
 *   - `VOLTage` / `CURRent` + `MEASure:SCALar:VOLTage|CURRent?` set
 *     and read back setpoints.
 *   - `OUTPut:STATe` toggles the per-channel relay.
 *   - `SOURce:VOLTage:PROTection:LEVel` + `:STATe` + `:TRIPped?` cover
 *     OVP; OCP uses `SOURce:CURRent:PROTection:LEVel`.
 *   - `*SAV` / `*RCL` drive the 10-slot preset memory.
 *
 * Advertised capabilities: protection + presets. Tracking / pairing
 * are NGx-model specific and not uniformly reachable; left undefined.
 */
export class RndsNge implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: NgeProfile;
  readonly protection: PsuProtectionCapability;
  readonly presets: PsuPresetCapability;
  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;
  #lastSelected: number | null = null;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: NgeProfile = NGE_DEFAULT,
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
    this.protection = {
      channels: [...this.#channelIds],
      ranges,
    };
    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<PsuChannelState[]> {
    const states: PsuChannelState[] = [];
    for (const id of this.#channelIds) {
      states.push(await this.#readChannel(id));
    }
    return states;
  }

  async setChannelOutput(channel: number, enabled: boolean): Promise<void> {
    await this.#select(channel);
    await this.port.write(`OUTPut:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setChannelVoltage(channel: number, volts: number): Promise<void> {
    await this.#select(channel);
    await this.port.write(`SOURce:VOLTage ${volts}`);
  }

  async setChannelCurrent(channel: number, amps: number): Promise<void> {
    await this.#select(channel);
    await this.port.write(`SOURce:CURRent ${amps}`);
  }

  async measureChannel(channel: number): Promise<PsuMeasurement> {
    await this.#select(channel);
    const [vRaw, iRaw] = await Promise.all([
      safeQuery(this.port, "MEASure:SCALar:VOLTage?"),
      safeQuery(this.port, "MEASure:SCALar:CURRent?"),
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
    await this.#select(channel);
    const base = kind === "ovp" ? "SOURce:VOLTage" : "SOURce:CURRent";
    const [levelRaw, stateRaw, trippedRaw] = await Promise.all([
      safeQuery(this.port, `${base}:PROTection:LEVel?`),
      safeQuery(this.port, `${base}:PROTection:STATe?`),
      safeQuery(this.port, `${base}:PROTection:TRIPped?`),
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
    await this.#select(channel);
    const base = kind === "ovp" ? "SOURce:VOLTage" : "SOURce:CURRent";
    await this.port.write(
      `${base}:PROTection:STATe ${enabled ? "ON" : "OFF"}`,
    );
  }

  async setProtectionLevel(
    channel: number,
    kind: PsuProtectionKind,
    level: number,
  ): Promise<void> {
    await this.#select(channel);
    const base = kind === "ovp" ? "SOURce:VOLTage" : "SOURce:CURRent";
    await this.port.write(`${base}:PROTection:LEVel ${level}`);
  }

  async clearProtectionTrip(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<void> {
    await this.#select(channel);
    const base = kind === "ovp" ? "SOURce:VOLTage" : "SOURce:CURRent";
    await this.port.write(`${base}:PROTection:CLEar`);
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

  async #select(channel: number): Promise<void> {
    if (!this.#channelIds.includes(channel)) {
      throw new Error(
        `R&S ${this.profile.variant} does not have channel ${channel}`,
      );
    }
    if (this.#lastSelected === channel) return;
    await this.port.write(`INSTrument:SELect OUT${channel}`);
    this.#lastSelected = channel;
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    await this.#select(id);
    const [setV, setI, measV, measI, outRaw] = await Promise.all([
      safeQuery(this.port, "SOURce:VOLTage?"),
      safeQuery(this.port, "SOURce:CURRent?"),
      safeQuery(this.port, "MEASure:SCALar:VOLTage?"),
      safeQuery(this.port, "MEASure:SCALar:CURRent?"),
      safeQuery(this.port, "OUTPut:STATe?"),
    ]);
    const label = this.profile.channels.find((c) => c.id === id)?.label ?? `OUT${id}`;
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

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }
}
