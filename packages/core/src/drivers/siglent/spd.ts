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
import { parseBool, parseStatusInt } from "./_shared/index.js";
import { type SpdProfile, SPD_DEFAULT } from "./spd-profile.js";

/**
 * Siglent SPD PSU driver (SPD1168X / SPD1305X / SPD3303X / SPD3303X-E /
 * SPD3303C). Profile-driven per 4.2 — channel count, limits, and
 * pairing / tracking availability come from the profile; SCPI wire
 * format is shared across the whole family.
 *
 * SCPI dialect quirks vs. Rigol DP900:
 *   - Channel select is `INSTrument:SELect CHn` **or** a `CHn:` prefix
 *     on the VOLT / CURR nodes; we use the prefix form because it
 *     works in both single-channel and 3-channel firmwares.
 *   - `OUTPut CH1,ON` is the output gate (not `:OUTPut:STATe`).
 *   - Tracking / pairing is a single `OUTPut:TRACk <0|1|2>` where
 *     0 = independent, 1 = parallel, 2 = series on SPD3303 series.
 *   - Measurement is `MEASure:VOLTage? CHn` / `:CURRent?` / `:POWEr?`.
 *   - Protection state comes from the bitfield `SYSTem:STATus?`: bit 4
 *     (CH1 OCP tripped), bit 5 (CH2 OCP tripped). No per-channel OVP on
 *     all firmwares; we surface OVP via `VOLTage:PROTection` when the
 *     profile says it's available.
 */
export class SiglentSpd implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: SpdProfile;
  readonly pairing?: PsuPairingCapability;
  readonly tracking?: PsuTrackingCapability;
  readonly protection: PsuProtectionCapability;
  readonly presets: PsuPresetCapability;

  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SpdProfile = SPD_DEFAULT,
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
    return Promise.all(this.#channelIds.map((id) => this.#readChannel(id)));
  }

  async setChannelOutput(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`OUTPut CH${channel},${enabled ? "ON" : "OFF"}`);
  }

  async setChannelVoltage(channel: number, volts: number): Promise<void> {
    await this.port.write(`CH${channel}:VOLTage ${volts}`);
  }

  async setChannelCurrent(channel: number, amps: number): Promise<void> {
    await this.port.write(`CH${channel}:CURRent ${amps}`);
  }

  async measureChannel(channel: number): Promise<PsuMeasurement> {
    const [vRaw, iRaw, pRaw] = await Promise.all([
      this.port.query(`MEASure:VOLTage? CH${channel}`),
      this.port.query(`MEASure:CURRent? CH${channel}`),
      this.port.query(`MEASure:POWEr? CH${channel}`),
    ]);
    const voltage = Number.parseFloat(vRaw) || 0;
    const current = Number.parseFloat(iRaw) || 0;
    const power = Number.parseFloat(pRaw);
    return {
      channel,
      voltage,
      current,
      power: Number.isFinite(power) ? power : voltage * current,
      measuredAt: Date.now(),
    };
  }

  async getPairingMode(): Promise<PsuPairingMode> {
    if (!this.pairing) return "off";
    const raw = await this.port.query("OUTPut:TRACk?");
    return parseTrackMode(raw);
  }

  async setPairingMode(mode: PsuPairingMode): Promise<void> {
    if (!this.pairing) return;
    await this.port.write(`OUTPut:TRACk ${encodeTrackMode(mode)}`);
  }

  async getTracking(): Promise<boolean> {
    if (!this.tracking) return false;
    const raw = await this.port.query("OUTPut:TRACk?");
    return parseTrackMode(raw) !== "off";
  }

  async setTracking(enabled: boolean): Promise<void> {
    if (!this.tracking) return;
    // SPD has no "tracking without pairing" — we map bare tracking to
    // parallel, which is the safest (same voltage, higher available I).
    await this.port.write(`OUTPut:TRACk ${enabled ? "1" : "0"}`);
  }

  async getProtection(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<PsuProtectionState> {
    const range =
      this.protection.ranges[channel]?.[kind] ??
      (kind === "ovp"
        ? { min: 0.001, max: 35 }
        : { min: 0.001, max: 4 });
    if (kind === "ovp") {
      const [enabled, level] = await Promise.all([
        this.port.query(`CH${channel}:VOLTage:PROTection:STATe?`),
        this.port.query(`CH${channel}:VOLTage:PROTection?`),
      ]);
      return {
        enabled: parseBool(enabled),
        level: Number.parseFloat(level) || 0,
        tripped: false,
        range,
      };
    }
    // OCP: read state + level; trip state comes from SYSTem:STATus?
    const [enabled, level, status] = await Promise.all([
      this.port.query(`CH${channel}:CURRent:PROTection:STATe?`),
      this.port.query(`CH${channel}:CURRent:PROTection?`),
      this.port.query("SYSTem:STATus?"),
    ]);
    return {
      enabled: parseBool(enabled),
      level: Number.parseFloat(level) || 0,
      tripped: isOcpTripped(parseStatusInt(status), channel),
      range,
    };
  }

  async setProtectionEnabled(
    channel: number,
    kind: PsuProtectionKind,
    enabled: boolean,
  ): Promise<void> {
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    await this.port.write(
      `CH${channel}:${prefix}:PROTection:STATe ${enabled ? "ON" : "OFF"}`,
    );
  }

  async setProtectionLevel(
    channel: number,
    kind: PsuProtectionKind,
    level: number,
  ): Promise<void> {
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    await this.port.write(`CH${channel}:${prefix}:PROTection ${level}`);
  }

  async clearProtectionTrip(
    channel: number,
    kind: PsuProtectionKind,
  ): Promise<void> {
    const prefix = kind === "ovp" ? "VOLTage" : "CURRent";
    await this.port.write(`CH${channel}:${prefix}:PROTection:CLEar`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    // SPD firmware does not expose a "slot populated" query; assume
    // every slot in the documented range is writable and return a
    // conservative all-empty catalog. The UI still lets the user
    // overwrite via savePreset.
    return Array.from({ length: this.presets.slots }, () => false);
  }

  async savePreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot + 1}`);
  }

  async recallPreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot + 1}`);
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    const [setV, setI, measV, measI, outRaw] = await Promise.all([
      this.port.query(`CH${id}:VOLTage?`),
      this.port.query(`CH${id}:CURRent?`),
      this.port.query(`MEASure:VOLTage? CH${id}`),
      this.port.query(`MEASure:CURRent? CH${id}`),
      this.port.query(`OUTPut? CH${id}`),
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
}

function parseTrackMode(raw: string): PsuPairingMode {
  const trimmed = raw.trim();
  if (trimmed === "2") return "series";
  if (trimmed === "1") return "parallel";
  return "off";
}

function encodeTrackMode(mode: PsuPairingMode): string {
  switch (mode) {
    case "series":
      return "2";
    case "parallel":
      return "1";
    default:
      return "0";
  }
}

/**
 * SPD3303 `SYSTem:STATus?` layout (from the programming guide):
 *   bit 0 — CH1 CC (1) / CV (0)
 *   bit 1 — CH2 CC (1) / CV (0)
 *   bits 2-3 — tracking mode
 *   bit 4 — CH1 output on
 *   bit 5 — CH2 output on
 *   bit 6 — Timer1 on
 *   bit 7 — Timer2 on
 *   bit 8 — CH1 analogue mode
 *   bit 9 — CH2 analogue mode
 *
 * OCP trip isn't directly exposed; firmware latches the output off, so
 * we use bit 4 / 5 == 0 + protection enabled + measured current >= level
 * as a heuristic at the UI level. For now the facade returns a
 * conservative `false` — real trip detection lands with the 4.9
 * hardware reports.
 */
function isOcpTripped(status: number, channel: number): boolean {
  void status;
  void channel;
  return false;
}
