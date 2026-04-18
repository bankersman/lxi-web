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

const CHANNEL_IDS = [1, 2, 3] as const;

// DP932E specifications: CH1/CH2 30V/3A, CH3 6V/3A. Treat as defaults; the
// set-points we push can be clamped by the instrument itself.
const CHANNEL_LIMITS: Readonly<Record<number, PsuChannelLimits>> = {
  1: { voltageMax: 30, currentMax: 3 },
  2: { voltageMax: 30, currentMax: 3 },
  3: { voltageMax: 6, currentMax: 3 },
};

/**
 * DP900 pairing engages CH1 and CH2 as a combined virtual channel — `series`
 * doubles the available voltage, `parallel` doubles the available current, and
 * CH3 stays independent either way.
 */
const PAIRING: PsuPairingCapability = {
  modes: ["off", "series", "parallel"],
  channels: [1, 2],
};

// OVP/OCP ranges per DP932E programming guide table 4.33. OVP/OCP can be set
// slightly above the channel's rated output (≈10%) so operators can protect
// at-or-above the nominal range without clamping their set-point.
const PROTECTION: PsuProtectionCapability = {
  channels: [1, 2, 3],
  ranges: {
    1: { ovp: { min: 0.001, max: 33 }, ocp: { min: 0.001, max: 3.3 } },
    2: { ovp: { min: 0.001, max: 33 }, ocp: { min: 0.001, max: 3.3 } },
    3: { ovp: { min: 0.001, max: 6.6 }, ocp: { min: 0.001, max: 3.3 } },
  },
};

// DP900 :OUTPut:TRACk mirrors set-points between CH1 and CH2.
const TRACKING: PsuTrackingCapability = { channels: [1, 2] };

// *SAV / *RCL expose slots 0..9, stored internally as RIGOL<n>.RSF.
const PRESETS: PsuPresetCapability = { slots: 10 };

/** Rigol DP900-series PSU driver (DP932E tested). */
export class RigolDp900 implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly pairing = PAIRING;
  readonly tracking = TRACKING;
  readonly protection = PROTECTION;
  readonly presets = PRESETS;

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
      PROTECTION.ranges[channel]?.[kind] ??
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
      Array.from({ length: PRESETS.slots }, (_, slot) =>
        this.port.query(`:MEMory:VALid? RIGOL${slot}.RSF`),
      ),
    );
    return results.map(parseBool);
  }

  async savePreset(slot: number): Promise<void> {
    assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    assertSlot(slot);
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
      limits: CHANNEL_LIMITS[id] ?? { voltageMax: 30, currentMax: 3 },
    };
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

// DP900 query responses are inconsistent between `1/0` (state) and `YES/NO`
// (:QUES?). Accept both so the same helper works for every protection query.
function parseBool(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "YES" || v === "TRUE";
}

function assertSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PRESETS.slots) {
    throw new RangeError(
      `preset slot must be an integer between 0 and ${PRESETS.slots - 1}`,
    );
  }
}
