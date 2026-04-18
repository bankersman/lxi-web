import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { OutputKillResult } from "../../facades/output-kill.js";
import { runPsuDisableAll } from "../../facades/output-kill.js";
import type {
  IPowerSupply,
  PsuChannelLimits,
  PsuChannelState,
  PsuMeasurement,
} from "../../facades/power-supply.js";
import { parseBool, parseNumberOrZero } from "./_shared/index.js";
import { type SpeProfile, SPE_DEFAULT } from "./spe-profile.js";

/**
 * Owon SPE PSU driver.
 *
 * Shape matches the SPE programming guide:
 *   - `INSTrument:NSELect <n>` selects the active channel.
 *   - `VOLTage <v>` / `CURRent <a>` set the setpoint for the selected
 *     channel (no `CH<n>:` prefix — Owon firmware drops it).
 *   - `OUTPut <ON|OFF>` or `OUTPut:STATe` toggles the output of the
 *     selected channel; the SPE3103 triple supports `OUTPut<n>` on
 *     newer firmwares but the NSELect path is universal.
 *   - `MEASure:VOLTage?` / `MEASure:CURRent?` return numeric scalars
 *     for the currently selected channel.
 *
 * `pairing`, `tracking`, `protection`, and `presets` are deliberately
 * not advertised: the firmware doesn't expose SCPI for them. The UI
 * auto-hides those tabs. Future community reports can promote the
 * capability surface via driver updates, not profile tweaks.
 */
export class OwonSpe implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: SpeProfile;
  readonly #channelIds: readonly number[];
  readonly #channelLimits: Readonly<Record<number, PsuChannelLimits>>;
  #lastSelected: number | null = null;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SpeProfile = SPE_DEFAULT,
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
      this.port.query("MEASure:VOLTage?"),
      this.port.query("MEASure:CURRent?"),
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
        `Owon ${this.profile.variant} does not have channel ${channel}`,
      );
    }
    if (this.#lastSelected === channel) return;
    // Skip the INST:NSEL hop on single-channel SKUs to save a round trip.
    if (this.#channelIds.length > 1) {
      await this.port.write(`INSTrument:NSELect ${channel}`);
    }
    this.#lastSelected = channel;
  }

  async #readChannel(id: number): Promise<PsuChannelState> {
    await this.#select(id);
    const [setV, setI, measV, measI, outRaw] = await Promise.all([
      this.port.query("VOLTage?"),
      this.port.query("CURRent?"),
      this.port.query("MEASure:VOLTage?"),
      this.port.query("MEASure:CURRent?"),
      this.port.query("OUTPut?"),
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

  async disableAllOutputs(): Promise<OutputKillResult> {
    return runPsuDisableAll(this);
  }
}
