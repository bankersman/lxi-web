import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type InstrumentPresetCapability,
  type MultimeterMode,
  type MultimeterRangeState,
  type MultimeterRangingCapability,
  type MultimeterReading,
} from "../../facades/multimeter.js";
import { parseBool, parseNumberOrZero, safeQuery, unquote } from "./_shared/index.js";
import { type GdmProfile, GDM_DEFAULT } from "./gdm-profile.js";

const SCPI_BY_MODE: Partial<Record<
  MultimeterMode,
  { readonly configure: string; readonly sense: string; readonly token: string }
>> = {
  dcVoltage: { configure: "CONFigure:VOLTage:DC", sense: "SENSe:VOLTage:DC", token: "VOLT" },
  acVoltage: { configure: "CONFigure:VOLTage:AC", sense: "SENSe:VOLTage:AC", token: "VOLT:AC" },
  dcCurrent: { configure: "CONFigure:CURRent:DC", sense: "SENSe:CURRent:DC", token: "CURR" },
  acCurrent: { configure: "CONFigure:CURRent:AC", sense: "SENSe:CURRent:AC", token: "CURR:AC" },
  resistance: { configure: "CONFigure:RESistance", sense: "SENSe:RESistance", token: "RES" },
  fourWireResistance: {
    configure: "CONFigure:FRESistance",
    sense: "SENSe:FRESistance",
    token: "FRES",
  },
  frequency: { configure: "CONFigure:FREQuency", sense: "SENSe:FREQuency", token: "FREQ" },
  period: { configure: "CONFigure:PERiod", sense: "SENSe:PERiod", token: "PER" },
  capacitance: { configure: "CONFigure:CAPacitance", sense: "SENSe:CAPacitance", token: "CAP" },
  continuity: { configure: "CONFigure:CONTinuity", sense: "SENSe:CONTinuity", token: "CONT" },
  diode: { configure: "CONFigure:DIODe", sense: "SENSe:DIODe", token: "DIOD" },
  temperature: {
    configure: "CONFigure:TEMPerature",
    sense: "SENSe:TEMPerature",
    token: "TEMP",
  },
};

/**
 * GW Instek GDM bench-DMM driver.
 *
 * Surface matches IVI-4.8 almost to the letter: `CONFigure:<fn>`,
 * `SENSe:FUNCtion?`, `READ?`, `SENSe:<fn>:RANGe[:AUTO]`,
 * `SENSe:<fn>:NPLC`. The GDM-8261A (entry 5½-digit) omits temperature,
 * capacitance, and math — gated off in the profile.
 */
export class GwInstekGdm implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly profile: GdmProfile;
  readonly supportedModes: readonly MultimeterMode[];
  readonly ranging: MultimeterRangingCapability;
  readonly presets?: InstrumentPresetCapability;

  #currentMode: MultimeterMode = "dcVoltage";

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: GdmProfile = GDM_DEFAULT,
  ) {
    this.profile = profile;
    this.supportedModes = profile.modes;
    this.ranging = {
      modes: profile.modes,
      ranges: profile.ranges,
      nplc: profile.nplcOptions,
      autoZero: profile.digits >= 6.5,
    };
    if (profile.presetSlots > 0) {
      this.presets = { slots: profile.presetSlots };
    }
  }

  async getMode(): Promise<MultimeterMode> {
    const raw = await safeQuery(this.port, "SENSe:FUNCtion?");
    const mode = decodeMode(unquote(raw), this.#currentMode);
    this.#currentMode = mode;
    return mode;
  }

  async setMode(mode: MultimeterMode): Promise<void> {
    const scpi = this.#requireScpi(mode);
    await this.port.write(scpi.configure);
    this.#currentMode = mode;
  }

  async read(): Promise<MultimeterReading> {
    const raw = await this.port.query("READ?", { timeoutMs: 10_000 });
    const value = parseNumberOrZero(raw);
    const mode = this.#currentMode;
    return {
      value,
      unit: DEFAULT_MULTIMETER_UNITS[mode],
      mode,
      measuredAt: Date.now(),
      overload: Math.abs(value) >= 9.9e37,
    };
  }

  async getRange(): Promise<MultimeterRangeState> {
    const mode = await this.getMode();
    const scpi = SCPI_BY_MODE[mode];
    if (!scpi) return { mode, upper: 0, auto: true };
    const [autoRaw, rangeRaw] = await Promise.all([
      safeQuery(this.port, `${scpi.sense}:RANGe:AUTO?`),
      safeQuery(this.port, `${scpi.sense}:RANGe?`),
    ]);
    return {
      mode,
      upper: parseNumberOrZero(rangeRaw),
      auto: parseBool(autoRaw),
    };
  }

  async setRange(mode: MultimeterMode, range: number | "auto"): Promise<void> {
    const scpi = this.#requireScpi(mode);
    if (range === "auto") {
      await this.port.write(`${scpi.sense}:RANGe:AUTO ON`);
      return;
    }
    await this.port.write(`${scpi.sense}:RANGe:AUTO OFF`);
    await this.port.write(`${scpi.sense}:RANGe ${range}`);
  }

  async getNplc(): Promise<number> {
    const scpi = SCPI_BY_MODE[this.#currentMode];
    if (!scpi) return 1;
    const raw = await safeQuery(this.port, `${scpi.sense}:NPLC?`);
    return parseNumberOrZero(raw) || 1;
  }

  async setNplc(value: number): Promise<void> {
    const scpi = SCPI_BY_MODE[this.#currentMode];
    if (!scpi) throw new Error(`mode '${this.#currentMode}' has no NPLC setting`);
    await this.port.write(`${scpi.sense}:NPLC ${value}`);
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    if (!this.presets) return [];
    return Array.from({ length: this.presets.slots }, () => true);
  }

  async savePreset(slot: number): Promise<void> {
    if (!this.presets) {
      throw new Error(`GDM ${this.profile.variant} has no preset memory`);
    }
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    if (!this.presets) {
      throw new Error(`GDM ${this.profile.variant} has no preset memory`);
    }
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot}`);
  }

  #requireScpi(mode: MultimeterMode) {
    if (!this.supportedModes.includes(mode)) {
      throw new Error(
        `GDM ${this.profile.variant} does not support mode ${mode}`,
      );
    }
    const scpi = SCPI_BY_MODE[mode];
    if (!scpi) throw new Error(`mode '${mode}' has no SCPI binding`);
    return scpi;
  }

  #assertSlot(slot: number): void {
    const slots = this.presets?.slots ?? 0;
    if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${slots - 1}`,
      );
    }
  }
}

function decodeMode(raw: string, fallback: MultimeterMode): MultimeterMode {
  const token = raw.trim().toUpperCase();
  if (!token) return fallback;
  if (token.startsWith("VOLT:AC")) return "acVoltage";
  if (token.startsWith("VOLT")) return "dcVoltage";
  if (token.startsWith("CURR:AC")) return "acCurrent";
  if (token.startsWith("CURR")) return "dcCurrent";
  if (token.startsWith("FRES")) return "fourWireResistance";
  if (token.startsWith("RES")) return "resistance";
  if (token.startsWith("FREQ")) return "frequency";
  if (token.startsWith("PER")) return "period";
  if (token.startsWith("CAP")) return "capacitance";
  if (token.startsWith("CONT")) return "continuity";
  if (token.startsWith("DIOD")) return "diode";
  if (token.startsWith("TEMP")) return "temperature";
  return fallback;
}
