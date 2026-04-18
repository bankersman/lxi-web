import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { OutputKillResult } from "../../facades/output-kill.js";
import { runPsuDisableAll } from "../../facades/output-kill.js";
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
import { parseBool } from "./_shared/index.js";
import { type E36Profile, E36_DEFAULT } from "./e36-profile.js";

/**
 * Keysight E36xxx / EDU36xxx PSU driver.
 *
 * Profile-driven; SCPI wire format is shared across EDU36311A,
 * E36100-series, E36300-series and legacy Agilent E364xA.
 *
 * SCPI conventions (from the E36300 / EDU36 Programmer's Reference):
 *   - Channel selection uses `INSTrument:NSELect <n>` (numeric) rather
 *     than the Siglent `CHn:` prefix; once selected the subsequent
 *     `VOLTage` / `CURRent` / `OUTPut` commands apply to that channel.
 *     Queries use the same pattern.
 *   - `VOLTage:PROTection[:LEVel]` + `:STATe` + `:TRIPped?` + `:CLEar`
 *     cover OVP. OCP uses `CURRent:PROTection:STATe` + `:CLEar` on the
 *     E36300; older E364x supports OCP differently and is documented
 *     with a `Preview` note at the 4.9 matrix level.
 *   - Tracking (E36300, EDU36) is `OUTPut:PAIR <NONE|SER|PAR>`; tracking
 *     lock-step of CH2/CH3 is `OUTPut:TRACk <ON|OFF>`.
 *   - Measurements: `MEASure:SCALar:VOLTage:DC? (@n)` / `:CURRent:DC?`.
 *     E364xA uses `MEASure:VOLTage? @n` (no `SCALar` intermediate).
 *     The shared read path below issues both forms via a safe helper.
 */
export class KeysightE36 implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: E36Profile;
  readonly pairing?: PsuPairingCapability;
  readonly tracking?: PsuTrackingCapability;
  readonly protection: PsuProtectionCapability;
  readonly presets: PsuPresetCapability;

  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: E36Profile = E36_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = profile.channels.map((c) => c.id);

    const limits: Record<number, PsuChannelLimits> = {};
    const ranges: Record<
      number,
      { readonly ovp: { min: number; max: number }; readonly ocp: { min: number; max: number } }
    > = {};
    for (const ch of profile.channels) {
      // `voltageMax` is always positive in the limits we hand to the UI; the
      // sign is encoded in `voltageMin`. The facade is polarity-agnostic.
      limits[ch.id] = {
        voltageMax: Math.abs(ch.voltageMax),
        currentMax: ch.currentMax,
      };
      ranges[ch.id] = { ovp: ch.ovpRange, ocp: ch.ocpRange };
    }
    this.#channelLimits = limits;

    if (profile.pairingChannels.length > 0) {
      this.pairing = {
        modes: ["off", "series", "parallel"],
        channels: profile.pairingChannels,
      };
    }
    if (profile.trackingChannels.length > 0) {
      this.tracking = { channels: profile.trackingChannels };
    }
    this.protection = { channels: this.#channelIds, ranges };
    this.presets = { slots: profile.presetSlots };
  }

  async getChannels(): Promise<PsuChannelState[]> {
    // Serialise channel reads. E36 firmwares are single-threaded on the
    // LAN session and batching with `INSTrument:NSELect` in flight has
    // been observed to return the wrong channel's values when the host
    // issues them in parallel.
    const out: PsuChannelState[] = [];
    for (const id of this.#channelIds) {
      out.push(await this.#readChannel(id));
    }
    return out;
  }

  async setChannelOutput(channel: number, enabled: boolean): Promise<void> {
    await this.#select(channel);
    await this.port.write(`OUTPut:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setChannelVoltage(channel: number, volts: number): Promise<void> {
    await this.#select(channel);
    await this.port.write(`VOLTage ${volts}`);
  }

  async setChannelCurrent(channel: number, amps: number): Promise<void> {
    await this.#select(channel);
    await this.port.write(`CURRent ${amps}`);
  }

  async measureChannel(channel: number): Promise<PsuMeasurement> {
    await this.#select(channel);
    const [vRaw, iRaw] = await Promise.all([
      this.port.query("MEASure:SCALar:VOLTage:DC?"),
      this.port.query("MEASure:SCALar:CURRent:DC?"),
    ]);
    const voltage = Number.parseFloat(vRaw) || 0;
    const current = Number.parseFloat(iRaw) || 0;
    return {
      channel,
      voltage,
      current,
      power: voltage * current,
      measuredAt: Date.now(),
    };
  }

  async getPairingMode(): Promise<PsuPairingMode> {
    if (!this.pairing) return "off";
    try {
      const raw = await this.port.query("OUTPut:PAIR?");
      const v = raw.trim().toUpperCase();
      if (v.startsWith("SER")) return "series";
      if (v.startsWith("PAR")) return "parallel";
      return "off";
    } catch {
      return "off";
    }
  }

  async setPairingMode(mode: PsuPairingMode): Promise<void> {
    if (!this.pairing) return;
    const cmd = mode === "series" ? "SER" : mode === "parallel" ? "PAR" : "NONE";
    await this.port.write(`OUTPut:PAIR ${cmd}`);
  }

  async getTracking(): Promise<boolean> {
    if (!this.tracking) return false;
    try {
      const raw = await this.port.query("OUTPut:TRACk?");
      return parseBool(raw);
    } catch {
      return false;
    }
  }

  async setTracking(enabled: boolean): Promise<void> {
    if (!this.tracking) return;
    await this.port.write(`OUTPut:TRACk ${enabled ? "ON" : "OFF"}`);
  }

  async getProtection(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<PsuProtectionState> {
    await this.#select(channel);
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    const range =
      this.protection.ranges[channel]?.[kind] ??
      (kind === "ovp" ? { min: 0.001, max: 35 } : { min: 0.001, max: 5 });
    const [enabledRaw, levelRaw, trippedRaw] = await Promise.all([
      this.port.query(`${prefix}:PROTection:STATe?`),
      this.port.query(`${prefix}:PROTection:LEVel?`),
      safeQuery(this.port, `${prefix}:PROTection:TRIPped?`),
    ]);
    return {
      enabled: parseBool(enabledRaw),
      level: Number.parseFloat(levelRaw) || 0,
      tripped: trippedRaw !== null ? parseBool(trippedRaw) : false,
      range,
    };
  }

  async setProtectionEnabled(
    channel: number,
    kind: PsuProtectionKind,
    enabled: boolean,
  ): Promise<void> {
    await this.#select(channel);
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    await this.port.write(`${prefix}:PROTection:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setProtectionLevel(
    channel: number,
    kind: PsuProtectionKind,
    level: number,
  ): Promise<void> {
    await this.#select(channel);
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    await this.port.write(`${prefix}:PROTection:LEVel ${level}`);
  }

  async clearProtectionTrip(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<void> {
    await this.#select(channel);
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    await this.port.write(`${prefix}:PROTection:CLEar`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    // `*RCL` / `*SAV` firmware doesn't expose a populated-slot query.
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

  async #select(channel: number): Promise<void> {
    // Single-channel variants accept the command but ignore it, so we
    // still issue it so the selector is always in sync.
    await this.port.write(`INSTrument:NSELect ${channel}`);
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    await this.#select(id);
    const [setV, setI, measV, measI, outRaw] = await Promise.all([
      this.port.query("VOLTage?"),
      this.port.query("CURRent?"),
      this.port.query("MEASure:SCALar:VOLTage:DC?"),
      this.port.query("MEASure:SCALar:CURRent:DC?"),
      this.port.query("OUTPut:STATe?"),
    ]);
    const label = this.profile.channels.find((c) => c.id === id)?.label ?? `CH${id}`;
    return {
      id,
      label,
      setVoltage: Number.parseFloat(setV) || 0,
      setCurrent: Number.parseFloat(setI) || 0,
      measuredVoltage: Number.parseFloat(measV) || 0,
      measuredCurrent: Number.parseFloat(measI) || 0,
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

  async disableAllOutputs(): Promise<OutputKillResult> {
    return runPsuDisableAll(this);
  }
}

async function safeQuery(port: ScpiPort, cmd: string): Promise<string | null> {
  try {
    return await port.query(cmd);
  } catch {
    return null;
  }
}
