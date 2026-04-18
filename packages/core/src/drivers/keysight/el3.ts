import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type { OutputKillResult } from "../../facades/output-kill.js";
import { runEloadDisableAll } from "../../facades/output-kill.js";
import type {
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
import { parseBool, parseNumberOrZero } from "./_shared/index.js";
import { type El3Profile, EL3_DEFAULT } from "./el3-profile.js";

/**
 * Keysight EL3xxx electronic-load driver (EL34143A / EL34243A).
 *
 * Preview entry per 4.9; core-mode / setpoint / measurement round-trip
 * + protection read-back. Dynamic load, list playback, and data
 * logger stay off the facade declaration until hardware reports land.
 *
 * SCPI shape — EL3 Programmer's Reference:
 *   - `INPut[:STATe] ON/OFF` toggles the load input.
 *   - `SOURce:FUNCtion CURR|VOLT|RES|POW` picks the mode.
 *   - `SOURce:<MODE>:LEVel:IMMediate:AMPLitude <val>` sets the
 *     setpoint; `:LEVel:TRIGgered:AMPLitude` is the next-trigger level.
 *   - `MEASure:VOLTage?` / `:CURRent?` / `:POWer?` / `:RESistance?`
 *     return instantaneous measurements.
 *   - Protection: `INPut:PROTection:OVP|OCP|OPP:STATe|LEVel|TRIPped?`
 *     plus `:CLEar`. OTP is fixed in firmware.
 *   - Channel selection on EL34243A: commands accept `(@1)` suffix
 *     OR the `CHANnel <n>` selector. For the 4.7 driver we address
 *     the currently-selected channel only; UI-side channel switching
 *     would layer on top of the existing single-channel surface.
 */
export class KeysightEl3 implements IElectronicLoad {
  readonly kind = "electronicLoad" as const;
  readonly profile: El3Profile;
  readonly limits: ElectronicLoadLimits;
  readonly protection: ElectronicLoadProtectionCapability;
  readonly presets: InstrumentPresetCapability;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: El3Profile = EL3_DEFAULT,
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
      otp: { min: 0, max: 120 },
    };
    this.protection = { kinds: ["ovp", "ocp", "opp", "otp"], ranges };
    this.presets = { slots: 10 };
  }

  async getState(): Promise<ElectronicLoadState> {
    const [enabledRaw, modeRaw, setpoints, measurement] = await Promise.all([
      this.port.query("INPut:STATe?"),
      this.port.query("SOURce:FUNCtion?"),
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
    await this.port.write(`INPut:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setMode(mode: ElectronicLoadMode): Promise<void> {
    await this.port.write(`SOURce:FUNCtion ${encodeMode(mode)}`);
  }

  async setSetpoint(mode: ElectronicLoadMode, value: number): Promise<void> {
    const node = modeNode(mode);
    await this.port.write(`SOURce:${node}:LEVel:IMMediate:AMPLitude ${value}`);
  }

  async getSetpoints(): Promise<ElectronicLoadSetpoints> {
    const [cc, cv, cr, cp] = await Promise.all([
      this.port.query("SOURce:CURRent:LEVel:IMMediate:AMPLitude?"),
      this.port.query("SOURce:VOLTage:LEVel:IMMediate:AMPLitude?"),
      this.port.query("SOURce:RESistance:LEVel:IMMediate:AMPLitude?"),
      this.port.query("SOURce:POWer:LEVel:IMMediate:AMPLitude?"),
    ]);
    return {
      cc: parseNumberOrZero(cc),
      cv: parseNumberOrZero(cv),
      cr: parseNumberOrZero(cr),
      cp: parseNumberOrZero(cp),
    };
  }

  async measure(): Promise<ElectronicLoadMeasurement> {
    const [v, i, p] = await Promise.all([
      this.port.query("MEASure:VOLTage?"),
      this.port.query("MEASure:CURRent?"),
      this.port.query("MEASure:POWer?"),
    ]);
    const voltage = parseNumberOrZero(v);
    const current = parseNumberOrZero(i);
    const power = parseNumberOrZero(p);
    // EL3 exposes resistance only indirectly via `MEASure:RESistance?`
    // which isn't documented on every firmware; derive it locally so
    // the facade always carries a value.
    const resistance = current > 1e-9 ? voltage / current : 0;
    return {
      voltage,
      current,
      power: power || voltage * current,
      resistance,
      measuredAt: Date.now(),
    };
  }

  async getProtection(
    kind: ElectronicLoadProtectionKind,
  ): Promise<ElectronicLoadProtectionState> {
    const range = this.protection.ranges[kind];
    if (kind === "otp") {
      return { enabled: true, level: 120, tripped: false, range };
    }
    const tag = kind.toUpperCase();
    const [enabled, level, trip] = await Promise.all([
      safeQuery(this.port, `INPut:PROTection:${tag}:STATe?`),
      safeQuery(this.port, `INPut:PROTection:${tag}:LEVel?`),
      safeQuery(this.port, `INPut:PROTection:${tag}:TRIPped?`),
    ]);
    return {
      enabled: enabled ? parseBool(enabled) : false,
      level: level ? parseNumberOrZero(level) : 0,
      tripped: trip ? parseBool(trip) : false,
      range,
    };
  }

  async setProtectionEnabled(
    kind: ElectronicLoadProtectionKind,
    enabled: boolean,
  ): Promise<void> {
    if (kind === "otp") return;
    const tag = kind.toUpperCase();
    await this.port.write(`INPut:PROTection:${tag}:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setProtectionLevel(
    kind: ElectronicLoadProtectionKind,
    level: number,
  ): Promise<void> {
    if (kind === "otp") {
      throw new RangeError("EL3 OTP is fixed in firmware and cannot be programmed");
    }
    const tag = kind.toUpperCase();
    await this.port.write(`INPut:PROTection:${tag}:LEVel ${level}`);
  }

  async clearProtectionTrip(kind: ElectronicLoadProtectionKind): Promise<void> {
    if (kind === "otp") return;
    const tag = kind.toUpperCase();
    await this.port.write(`INPut:PROTection:${tag}:CLEar`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
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

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }

  async disableAllOutputs(): Promise<OutputKillResult> {
    return runEloadDisableAll(this);
  }
}

function decodeMode(raw: string): ElectronicLoadMode {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("VOLT")) return "cv";
  if (v.startsWith("RES")) return "cr";
  if (v.startsWith("POW")) return "cp";
  return "cc";
}

function encodeMode(mode: ElectronicLoadMode): string {
  switch (mode) {
    case "cv":
      return "VOLTage";
    case "cr":
      return "RESistance";
    case "cp":
      return "POWer";
    default:
      return "CURRent";
  }
}

function modeNode(mode: ElectronicLoadMode): string {
  switch (mode) {
    case "cv":
      return "VOLTage";
    case "cr":
      return "RESistance";
    case "cp":
      return "POWer";
    default:
      return "CURRent";
  }
}

async function safeQuery(port: ScpiPort, cmd: string): Promise<string | null> {
  try {
    return await port.query(cmd);
  } catch {
    return null;
  }
}
