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
import { type SdlProfile, SDL_DEFAULT } from "./sdl-profile.js";

/**
 * Siglent SDL electronic-load driver.
 *
 * Profile-driven per 4.2 (SDL1020X / SDL1020X-E / SDL1030X / SDL1030X-E).
 * First-pass Preview entry: core mode / setpoint / measurement round-trip
 * plus protection (OVP / OCP / OPP / OTP) read-back. Dynamic load,
 * battery discharge, and list playback advertise capability on the
 * profile but are gated behind hardware verification (first community
 * report flips each capability on).
 *
 * SCPI shape:
 *   - `:SOURce:INPut:STATe ON/OFF` — input relay.
 *   - `:SOURce:FUNCtion CURRent|VOLTage|POWer|RESistance` — mode.
 *   - `:SOURce:<mode>:LEVel:IMMediate <val>` — setpoint.
 *   - `:MEASure:VOLTage?` / `:CURRent?` / `:POWer?` / `:RESistance?` —
 *     instantaneous measurements.
 *   - `:SOURce:<V|C|P>:PROTection:STATe` + `:LEVel` + `:TRIP?` —
 *     protection state + trip latch.
 */
export class SiglentSdl implements IElectronicLoad {
  readonly kind = "electronicLoad" as const;
  readonly profile: SdlProfile;
  readonly limits: ElectronicLoadLimits;
  readonly protection: ElectronicLoadProtectionCapability;
  readonly presets: InstrumentPresetCapability;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SdlProfile = SDL_DEFAULT,
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
    const node = modeNode(mode);
    await this.port.write(`:SOURce:${node}:LEVel:IMMediate ${value}`);
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

  async getProtection(kind: ElectronicLoadProtectionKind): Promise<ElectronicLoadProtectionState> {
    const range = this.protection.ranges[kind];
    if (kind === "otp") {
      // OTP on SDL is fixed to ≈120 °C in firmware; expose the trip
      // status only.
      return {
        enabled: true,
        level: 120,
        tripped: false,
        range,
      };
    }
    const prefix = protectionPrefix(kind);
    const [enabled, level, trip] = await Promise.all([
      safeQuery(this.port, `:SOURce:${prefix}:PROTection:STATe?`),
      safeQuery(this.port, `:SOURce:${prefix}:PROTection:LEVel?`),
      safeQuery(this.port, `:SOURce:${prefix}:PROTection:TRIP?`),
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
    const prefix = protectionPrefix(kind);
    await this.port.write(`:SOURce:${prefix}:PROTection:STATe ${enabled ? "ON" : "OFF"}`);
  }

  async setProtectionLevel(
    kind: ElectronicLoadProtectionKind,
    level: number,
  ): Promise<void> {
    if (kind === "otp") {
      throw new RangeError("SDL OTP is fixed in firmware and cannot be programmed");
    }
    const prefix = protectionPrefix(kind);
    await this.port.write(`:SOURce:${prefix}:PROTection:LEVel ${level}`);
  }

  async clearProtectionTrip(kind: ElectronicLoadProtectionKind): Promise<void> {
    if (kind === "otp") return;
    const prefix = protectionPrefix(kind);
    await this.port.write(`:SOURce:${prefix}:PROTection:CLEar`);
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

function protectionPrefix(kind: ElectronicLoadProtectionKind): string {
  switch (kind) {
    case "ovp":
      return "VOLTage";
    case "ocp":
      return "CURRent";
    case "opp":
      return "POWer";
    case "otp":
    default:
      return "VOLTage";
  }
}

async function safeQuery(port: ScpiPort, cmd: string): Promise<string | null> {
  try {
    return await port.query(cmd);
  } catch {
    return null;
  }
}
