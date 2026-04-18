import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IPowerSupply,
  PsuChannelLimits,
  PsuChannelState,
  PsuMeasurement,
} from "../../facades/power-supply.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import { type PwsProfile, PWS_DEFAULT } from "./pws-profile.js";

/**
 * Tektronix PWS2000 / PWS4000 power supply driver.
 *
 * Single-output chassis (PWS2185, PWS4305, …) don't need the `INST:SEL`
 * hop; multi-output (PWS4323) switches the active channel via
 * `INSTrument:SELect OUT<n>` and then talks to it through the bare
 * `VOLT`, `CURR`, `OUTP`, `MEAS:*` tree.
 *
 * The driver deliberately keeps the facade narrow: pairing, tracking,
 * protection, and presets are not reliably exposed in the PWS firmware
 * set — they stay undefined so the UI auto-hides those tabs. Preview
 * rows in the supported-hardware matrix capture the caveat.
 */
export class TektronixPws implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: PwsProfile;
  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;
  #lastSelected: number | null = null;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: PwsProfile = PWS_DEFAULT,
  ) {
    this.profile = profile;
    this.#channelIds = profile.channels.map((c) => c.id);
    const limits: Record<number, PsuChannelLimits> = {};
    for (const ch of profile.channels) {
      limits[ch.id] = { voltageMax: ch.voltageMax, currentMax: ch.currentMax };
    }
    this.#channelLimits = limits;
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
    await this.port.write(`OUTPut ${enabled ? "ON" : "OFF"}`);
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
      safeQuery(this.port, "MEASure:VOLTage?"),
      safeQuery(this.port, "MEASure:CURRent?"),
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

  async #select(channel: number): Promise<void> {
    if (!this.#channelIds.includes(channel)) {
      throw new Error(
        `Tektronix ${this.profile.variant} does not have channel ${channel}`,
      );
    }
    if (this.#lastSelected === channel) return;
    if (this.#channelIds.length > 1) {
      await this.port.write(`INSTrument:SELect OUT${channel}`);
    }
    this.#lastSelected = channel;
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    await this.#select(id);
    const [setV, setI, measV, measI, outRaw] = await Promise.all([
      safeQuery(this.port, "VOLTage?"),
      safeQuery(this.port, "CURRent?"),
      safeQuery(this.port, "MEASure:VOLTage?"),
      safeQuery(this.port, "MEASure:CURRent?"),
      safeQuery(this.port, "OUTPut?"),
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
}
