import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IPowerSupply,
  PsuChannelLimits,
  PsuChannelState,
  PsuMeasurement,
} from "../../facades/power-supply.js";

const CHANNEL_IDS = [1, 2, 3] as const;

// DP932E specifications: CH1/CH2 30V/3A, CH3 6V/3A. Treat as defaults; the
// set-points we push can be clamped by the instrument itself.
const CHANNEL_LIMITS: Readonly<Record<number, PsuChannelLimits>> = {
  1: { voltageMax: 30, currentMax: 3 },
  2: { voltageMax: 30, currentMax: 3 },
  3: { voltageMax: 6, currentMax: 3 },
};

/** Rigol DP900-series PSU driver (DP932E tested). */
export class RigolDp900 implements IPowerSupply {
  readonly kind = "powerSupply" as const;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
  ) {}

  async getChannels(): Promise<PsuChannelState[]> {
    return Promise.all(CHANNEL_IDS.map((id) => this.#readChannel(id)));
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
      limits: CHANNEL_LIMITS[id] ?? { voltageMax: 30, currentMax: 3 },
    };
  }
}

function parseOutputState(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "1" || v === "ON" || v.endsWith(",ON");
}
