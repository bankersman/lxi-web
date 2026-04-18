import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { OutputKillResult } from "../../facades/output-kill.js";
import { runEloadDisableAll } from "../../facades/output-kill.js";
import type {
  ElectronicLoadBatteryCapability,
  ElectronicLoadBatteryConfig,
  ElectronicLoadBatteryState,
  ElectronicLoadDynamicCapability,
  ElectronicLoadDynamicConfig,
  ElectronicLoadLimits,
  ElectronicLoadMeasurement,
  ElectronicLoadMode,
  ElectronicLoadProtectionCapability,
  ElectronicLoadProtectionKind,
  ElectronicLoadProtectionRange,
  ElectronicLoadProtectionState,
  ElectronicLoadSetpoints,
  ElectronicLoadState,
  IElectronicLoad,
} from "../../facades/electronic-load.js";
import type { InstrumentPresetCapability } from "../../facades/multimeter.js";
import { type Dl3000Profile, DL3000_DEFAULT } from "./dl3000-profile.js";
import { parseBool, parseNumberOrZero } from "./_shared/index.js";

/**
 * Rigol DL3000-series electronic-load driver. Covers DL3021 and DL3031; the
 * SCPI tree is identical between the two — only the declared limits change,
 * which come from the profile.
 */
export class RigolDl3000 implements IElectronicLoad {
  readonly kind = "electronicLoad" as const;
  readonly profile: Dl3000Profile;
  readonly limits: ElectronicLoadLimits;
  readonly protection: ElectronicLoadProtectionCapability;
  readonly dynamic: ElectronicLoadDynamicCapability;
  readonly battery: ElectronicLoadBatteryCapability;
  readonly presets: InstrumentPresetCapability;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Dl3000Profile = DL3000_DEFAULT,
  ) {
    this.profile = profile;
    this.limits = {
      voltageMax: profile.voltageMax,
      currentMax: profile.currentMax,
      powerMax: profile.powerMax,
      resistanceRange: profile.resistanceRange,
    };

    const ranges: Record<ElectronicLoadProtectionKind, ElectronicLoadProtectionRange> = {
      ovp: { min: 0, max: profile.voltageMax },
      ocp: { min: 0, max: profile.currentMax },
      opp: { min: 0, max: profile.powerMax },
      // DL3000 OTP is fixed in firmware — we expose readback but reject level writes.
      otp: { min: 0, max: 120 },
    };
    this.protection = {
      kinds: ["ovp", "ocp", "opp", "otp"],
      ranges,
    };

    this.dynamic = {
      modes: ["cc", "cv", "cr", "cp"],
      slewRateMax: 2.5, // A/µs per DL3000 specs
      timeRange: { min: 20e-6, max: 999 },
    };

    this.battery = {
      modes: ["cc", "cr", "cp"],
      cutoffVoltageRange: { min: 0, max: profile.voltageMax },
      cutoffCapacityRange: { min: 0, max: 999 },
      cutoffTimeRangeSec: { min: 0, max: 99_999 },
    };

    this.presets = { slots: profile.presetSlots };
  }

  async getState(): Promise<ElectronicLoadState> {
    const [enabledRaw, modeRaw, setpoints, measurement] = await Promise.all([
      this.port.query(":SOURce:INPut:STATe?"),
      this.port.query(":SOURce:FUNCtion?"),
      this.getSetpoints(),
      this.measure(),
    ]);
    return {
      enabled: parseBool(enabledRaw),
      mode: decodeMode(modeRaw),
      setpoints,
      measurement,
      limits: this.limits,
    };
  }

  async setInputEnabled(enabled: boolean): Promise<void> {
    await this.port.write(`:SOURce:INPut:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setMode(mode: ElectronicLoadMode): Promise<void> {
    await this.port.write(`:SOURce:FUNCtion ${encodeMode(mode)}`);
  }

  async setSetpoint(mode: ElectronicLoadMode, value: number): Promise<void> {
    this.#validateSetpoint(mode, value);
    await this.port.write(`:SOURce:${scpiMode(mode)}:LEVel:IMMediate ${value}`);
  }

  async getSetpoints(): Promise<ElectronicLoadSetpoints> {
    const [cc, cv, cr, cp] = await Promise.all([
      this.port.query(":SOURce:CURRent:LEVel:IMMediate?"),
      this.port.query(":SOURce:VOLTage:LEVel:IMMediate?"),
      this.port.query(":SOURce:RESistance:LEVel:IMMediate?"),
      this.port.query(":SOURce:POWer:LEVel:IMMediate?"),
    ]);
    return {
      cc: parseNumberOrZero(cc),
      cv: parseNumberOrZero(cv),
      cr: parseNumberOrZero(cr),
      cp: parseNumberOrZero(cp),
    };
  }

  async measure(): Promise<ElectronicLoadMeasurement> {
    const [v, i, p, r] = await Promise.all([
      this.port.query(":MEASure:VOLTage?"),
      this.port.query(":MEASure:CURRent?"),
      this.port.query(":MEASure:POWer?"),
      this.port.query(":MEASure:RESistance?"),
    ]);
    return {
      voltage: parseNumberOrZero(v),
      current: parseNumberOrZero(i),
      power: parseNumberOrZero(p),
      resistance: parseNumberOrZero(r),
      measuredAt: Date.now(),
    };
  }

  async getProtection(
    kind: ElectronicLoadProtectionKind,
  ): Promise<ElectronicLoadProtectionState> {
    const range = this.protection.ranges[kind];
    if (kind === "otp") {
      // Fixed, always-on. Report the fault latch via `:SYSTem:OTP?`.
      const tripped = await this.port.query(":SYSTem:OTP?");
      return {
        enabled: true,
        level: range.max,
        tripped: parseBool(tripped),
        range,
      };
    }
    const prefix = protPrefix(kind);
    const [stateRaw, levelRaw, trippedRaw] = await Promise.all([
      this.port.query(`${prefix}:STATe?`),
      this.port.query(`${prefix}:LEVel?`),
      this.port.query(`${prefix}:TRIPped?`),
    ]);
    return {
      enabled: parseBool(stateRaw),
      level: parseNumberOrZero(levelRaw),
      tripped: parseBool(trippedRaw),
      range,
    };
  }

  async setProtectionEnabled(
    kind: ElectronicLoadProtectionKind,
    enabled: boolean,
  ): Promise<void> {
    if (kind === "otp") {
      throw new RangeError("OTP is always enabled on DL3000");
    }
    await this.port.write(`${protPrefix(kind)}:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setProtectionLevel(
    kind: ElectronicLoadProtectionKind,
    level: number,
  ): Promise<void> {
    if (kind === "otp") {
      throw new RangeError("OTP trip level is fixed on DL3000");
    }
    const range = this.protection.ranges[kind];
    if (level < range.min || level > range.max) {
      throw new RangeError(
        `${kind.toUpperCase()} level ${level} outside ${range.min}..${range.max}`,
      );
    }
    await this.port.write(`${protPrefix(kind)}:LEVel ${level}`);
  }

  async clearProtectionTrip(kind: ElectronicLoadProtectionKind): Promise<void> {
    if (kind === "otp") {
      // Cleared by cycling input state; firmware latches the fault until the
      // user dismisses it on the front panel, so we approximate that here.
      await this.port.write(":SOURce:INPut:STATe OFF");
      return;
    }
    await this.port.write(`${protPrefix(kind)}:CLEar`);
  }

  async getDynamicConfig(): Promise<ElectronicLoadDynamicConfig> {
    const modeRaw = await this.port.query(":SOURce:FUNCtion:TRANsient?");
    const mode = decodeMode(modeRaw);
    const prefix = `:SOURce:${scpiMode(mode)}:TRANsient`;
    const [enabled, a, b, tA, tB, slew] = await Promise.all([
      this.port.query(":SOURce:INPut:TRANsient?"),
      this.port.query(`${prefix}:ALEVel?`),
      this.port.query(`${prefix}:BLEVel?`),
      this.port.query(`${prefix}:AWIDth?`),
      this.port.query(`${prefix}:BWIDth?`),
      this.port.query(`${prefix}:SRATe?`),
    ]);
    const widthA = parseNumberOrZero(tA);
    const widthB = parseNumberOrZero(tB);
    const period = widthA + widthB;
    return {
      enabled: parseBool(enabled),
      levelA: parseNumberOrZero(a),
      levelB: parseNumberOrZero(b),
      timeA: widthA,
      timeB: widthB,
      slewRate: parseNumberOrZero(slew),
      frequencyHz: period > 0 ? 1 / period : 0,
    };
  }

  async setDynamicConfig(config: ElectronicLoadDynamicConfig): Promise<void> {
    const modeRaw = await this.port.query(":SOURce:FUNCtion:TRANsient?");
    const mode = decodeMode(modeRaw);
    const prefix = `:SOURce:${scpiMode(mode)}:TRANsient`;
    await this.port.write(`${prefix}:ALEVel ${config.levelA}`);
    await this.port.write(`${prefix}:BLEVel ${config.levelB}`);
    await this.port.write(`${prefix}:AWIDth ${config.timeA}`);
    await this.port.write(`${prefix}:BWIDth ${config.timeB}`);
    if (config.slewRate > 0) {
      await this.port.write(`${prefix}:SRATe ${config.slewRate}`);
    }
    await this.port.write(
      `:SOURce:INPut:TRANsient ${config.enabled ? "ON" : "OFF"}`,
    );
  }

  async getBatteryState(): Promise<ElectronicLoadBatteryState> {
    const [
      running,
      modeRaw,
      levelRaw,
      voltRaw,
      capRaw,
      timeRaw,
      elapsedRaw,
      accCapRaw,
      accEnergyRaw,
      stopReasonRaw,
    ] = await Promise.all([
      this.port.query(":SOURce:BATTery:STATe?"),
      this.port.query(":SOURce:BATTery:FUNCtion?"),
      this.port.query(":SOURce:BATTery:LEVel?"),
      this.port.query(":SOURce:BATTery:VOLTage?"),
      this.port.query(":SOURce:BATTery:CAPability?"),
      this.port.query(":SOURce:BATTery:TIMer?"),
      this.port.query(":SOURce:BATTery:TIMe?"),
      this.port.query(":SOURce:BATTery:DISChar:CAPability?"),
      this.port.query(":SOURce:BATTery:DISChar:ENERgy?"),
      this.port.query(":SOURce:BATTery:STOP?"),
    ]);
    return {
      running: parseBool(running),
      config: {
        mode: decodeBatteryMode(modeRaw),
        level: parseNumberOrZero(levelRaw),
        cutoffVoltage: parseNumberOrZero(voltRaw),
        cutoffCapacity: parseNumberOrZero(capRaw),
        cutoffTimeSec: parseNumberOrZero(timeRaw),
      },
      elapsedSec: parseNumberOrZero(elapsedRaw),
      capacity: parseNumberOrZero(accCapRaw),
      energy: parseNumberOrZero(accEnergyRaw),
      stoppedBy: decodeStopReason(stopReasonRaw),
    };
  }

  async startBattery(config: ElectronicLoadBatteryConfig): Promise<void> {
    await this.port.write(
      `:SOURce:BATTery:FUNCtion ${encodeBatteryMode(config.mode)}`,
    );
    await this.port.write(`:SOURce:BATTery:LEVel ${config.level}`);
    await this.port.write(`:SOURce:BATTery:VOLTage ${config.cutoffVoltage}`);
    await this.port.write(`:SOURce:BATTery:CAPability ${config.cutoffCapacity}`);
    await this.port.write(`:SOURce:BATTery:TIMer ${config.cutoffTimeSec}`);
    await this.port.write(":SOURce:BATTery:STATe ON");
  }

  async stopBattery(): Promise<void> {
    await this.port.write(":SOURce:BATTery:STATe OFF");
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    // DL3000 does not expose per-slot validity over SCPI; report all slots as
    // "present" so the UI can offer save/recall without refusing recall of
    // an empty slot (the instrument itself will beep on invalid recalls).
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

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }

  #validateSetpoint(mode: ElectronicLoadMode, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`setpoint must be a non-negative finite number`);
    }
    switch (mode) {
      case "cc":
        if (value > this.limits.currentMax)
          throw new RangeError(`CC ${value} > ${this.limits.currentMax}A`);
        return;
      case "cv":
        if (value > this.limits.voltageMax)
          throw new RangeError(`CV ${value} > ${this.limits.voltageMax}V`);
        return;
      case "cp":
        if (value > this.limits.powerMax)
          throw new RangeError(`CP ${value} > ${this.limits.powerMax}W`);
        return;
      case "cr":
        if (
          value < this.limits.resistanceRange.min ||
          value > this.limits.resistanceRange.max
        ) {
          throw new RangeError(
            `CR ${value} outside ${this.limits.resistanceRange.min}..${this.limits.resistanceRange.max}Ω`,
          );
        }
        return;
    }
  }

  async disableAllOutputs(): Promise<OutputKillResult> {
    return runEloadDisableAll(this);
  }
}

function encodeMode(mode: ElectronicLoadMode): string {
  switch (mode) {
    case "cc":
      return "CURRent";
    case "cv":
      return "VOLTage";
    case "cr":
      return "RESistance";
    case "cp":
      return "POWer";
  }
}

function scpiMode(mode: ElectronicLoadMode): string {
  return encodeMode(mode);
}

function decodeMode(raw: string): ElectronicLoadMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("VOLT")) return "cv";
  if (v.startsWith("RES")) return "cr";
  if (v.startsWith("POW")) return "cp";
  return "cc";
}

function protPrefix(kind: Exclude<ElectronicLoadProtectionKind, "otp">): string {
  switch (kind) {
    case "ovp":
      return ":SOURce:VOLTage:PROTection";
    case "ocp":
      return ":SOURce:CURRent:PROTection";
    case "opp":
      return ":SOURce:POWer:PROTection";
  }
}

function encodeBatteryMode(mode: "cc" | "cr" | "cp"): string {
  switch (mode) {
    case "cc":
      return "CURRent";
    case "cr":
      return "RESistance";
    case "cp":
      return "POWer";
  }
}

function decodeBatteryMode(raw: string): "cc" | "cr" | "cp" {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("RES")) return "cr";
  if (v.startsWith("POW")) return "cp";
  return "cc";
}

function decodeStopReason(raw: string): ElectronicLoadBatteryState["stoppedBy"] {
  const v = raw.trim().toUpperCase();
  if (v === "VOLT" || v === "VOLTAGE") return "voltage";
  if (v === "CAP" || v === "CAPACITY") return "capacity";
  if (v === "TIME" || v === "TIMER") return "time";
  if (v === "USER" || v === "MANUAL") return "user";
  return null;
}
