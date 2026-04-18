import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type InstrumentPresetCapability,
  type MultimeterAutoZero,
  type MultimeterDualDisplayCapability,
  type MultimeterMode,
  type MultimeterRangeState,
  type MultimeterRangingCapability,
  type MultimeterReading,
  type MultimeterTemperatureCapability,
  type MultimeterTemperatureConfig,
  type MultimeterTriggerCapability,
  type MultimeterTriggerConfig,
  type MultimeterTriggerSource,
  type TemperatureTransducer,
  type TemperatureUnit,
} from "../../facades/multimeter.js";
import { isOverload, parseBool, unquote } from "./_shared/index.js";
import { type TrueVoltProfile, TRUEVOLT_DEFAULT } from "./truevolt-profile.js";

/**
 * Keysight Truevolt 34400A-series DMM driver (34450A / 34461A / 34465A /
 * 34470A) plus the legacy Agilent 34410A / 34411A (same SCPI dialect).
 *
 * SCPI dialect — Truevolt Programmer's Reference:
 *   - `CONFigure:<fn>` sets mode; `FUNCtion?` reads it back as a quoted
 *     string (`"VOLT"`, `"VOLT:AC"` ...).
 *   - `READ?` fetches a fresh reading; `FETCh?` fetches buffered data
 *     without retriggering.
 *   - `SENSe:<fn>:RANGe` / `:RANGe:AUTO`, `:NPLC`, `:ZERO:AUTO` shape
 *     the front end.
 *   - `TRIGger:SOURce` + `SAMPle:COUNt` + `TRIGger:DELay` drive
 *     triggered acquisitions; `*TRG` is software trigger.
 *   - `CALCulate:FUNCtion SEC` enables dual display on 34461A+; the
 *     34450A does not support dual display and the driver short-circuits.
 */
const TRIGGERING: MultimeterTriggerCapability = {
  sources: ["immediate", "external", "bus", "software"],
  slopes: ["positive", "negative"],
  sampleCountRange: { min: 1, max: 1_000_000 },
  delayRangeSec: { min: 0, max: 3600 },
};

type TrueVoltScpi = {
  readonly configure: string;
  readonly sense: string;
  readonly token: string;
};

const SCPI_MAP: Partial<Record<MultimeterMode, TrueVoltScpi>> = {
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
  capacitance: {
    configure: "CONFigure:CAPacitance",
    sense: "SENSe:CAPacitance",
    token: "CAP",
  },
  continuity: {
    configure: "CONFigure:CONTinuity",
    sense: "SENSe:CONTinuity",
    token: "CONT",
  },
  diode: { configure: "CONFigure:DIODe", sense: "SENSe:DIODe", token: "DIOD" },
  temperature: {
    configure: "CONFigure:TEMPerature",
    sense: "SENSe:TEMPerature",
    token: "TEMP",
  },
};

const TRANSDUCER_SCPI: Record<TemperatureTransducer, string> = {
  pt100: "FRTD,PT100",
  pt1000: "FRTD,PT1000",
  "thermocouple-k": "TCOuple,K",
  "thermocouple-j": "TCOuple,J",
  "thermocouple-t": "TCOuple,T",
  "thermocouple-e": "TCOuple,E",
  thermistor: "THER,10000",
};

const UNIT_SCPI: Record<TemperatureUnit, string> = {
  celsius: "C",
  fahrenheit: "F",
  kelvin: "K",
};

export class KeysightTrueVolt implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly profile: TrueVoltProfile;
  readonly supportedModes: readonly MultimeterMode[];
  readonly ranging: MultimeterRangingCapability;
  readonly triggering = TRIGGERING;
  readonly dualDisplay?: MultimeterDualDisplayCapability;
  readonly temperature?: MultimeterTemperatureCapability;
  readonly presets: InstrumentPresetCapability;

  #currentMode: MultimeterMode = "dcVoltage";

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: TrueVoltProfile = TRUEVOLT_DEFAULT,
  ) {
    this.profile = profile;
    this.supportedModes = profile.modes;
    this.ranging = {
      modes: profile.modes,
      ranges: profile.ranges,
      nplc: profile.nplcOptions,
      autoZero: true,
    };
    if (Object.keys(profile.dualDisplayPairs).length > 0) {
      this.dualDisplay = { pairs: profile.dualDisplayPairs };
    }
    if (profile.transducers.length > 0) {
      this.temperature = {
        units: ["celsius", "fahrenheit", "kelvin"],
        transducers: profile.transducers,
      };
    }
    this.presets = { slots: profile.presetSlots };
  }

  async getMode(): Promise<MultimeterMode> {
    const raw = await this.port.query("FUNCtion?");
    const mode = decodeMode(raw, this.#currentMode);
    this.#currentMode = mode;
    return mode;
  }

  async setMode(mode: MultimeterMode): Promise<void> {
    const scpi = this.#requireScpi(mode);
    await this.port.write(scpi.configure);
    this.#currentMode = mode;
  }

  async read(): Promise<MultimeterReading> {
    const mode = await this.getMode();
    const raw = await this.port.query("READ?");
    const parsed = parseReadingValue(raw);
    return {
      value: parsed.value,
      unit: DEFAULT_MULTIMETER_UNITS[mode],
      mode,
      measuredAt: Date.now(),
      overload: parsed.overload,
    };
  }

  async getRange(): Promise<MultimeterRangeState> {
    const mode = await this.getMode();
    const scpi = SCPI_MAP[mode];
    if (!scpi) return { mode, upper: 0, auto: true };
    const [autoRaw, rangeRaw] = await Promise.all([
      this.port.query(`${scpi.sense}:RANGe:AUTO?`),
      this.port.query(`${scpi.sense}:RANGe?`),
    ]);
    return {
      mode,
      upper: Number.parseFloat(rangeRaw) || 0,
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
    const mode = this.#currentMode;
    const scpi = SCPI_MAP[mode];
    if (!scpi || !supportsNplc(mode)) return 1;
    try {
      const raw = await this.port.query(`${scpi.sense}:NPLCycles?`);
      return Number.parseFloat(raw) || 1;
    } catch {
      return 1;
    }
  }

  async setNplc(value: number): Promise<void> {
    const mode = this.#currentMode;
    const scpi = SCPI_MAP[mode];
    if (!scpi || !supportsNplc(mode)) return;
    await this.port.write(`${scpi.sense}:NPLCycles ${value}`);
  }

  async setAutoZero(mode: MultimeterAutoZero): Promise<void> {
    const scpi = SCPI_MAP[this.#currentMode];
    if (!scpi) return;
    const cmd = mode === "once" ? "ONCE" : mode.toUpperCase();
    await this.port.write(`${scpi.sense}:ZERO:AUTO ${cmd}`);
  }

  async getTriggerConfig(): Promise<MultimeterTriggerConfig> {
    const [sourceRaw, delayRaw, countRaw] = await Promise.all([
      this.port.query("TRIGger:SOURce?"),
      this.port.query("TRIGger:DELay?"),
      this.port.query("SAMPle:COUNt?"),
    ]);
    return {
      source: decodeTriggerSource(sourceRaw),
      slope: "positive",
      delaySec: Number.parseFloat(delayRaw) || 0,
      sampleCount: Math.max(1, Number.parseInt(countRaw, 10) || 1),
    };
  }

  async setTriggerConfig(config: MultimeterTriggerConfig): Promise<void> {
    await this.port.write(`TRIGger:SOURce ${encodeTriggerSource(config.source)}`);
    await this.port.write(`TRIGger:DELay ${config.delaySec}`);
    await this.port.write(
      `SAMPle:COUNt ${Math.max(1, Math.floor(config.sampleCount))}`,
    );
  }

  async trigger(): Promise<void> {
    await this.port.write("*TRG");
  }

  async getDualDisplay(): Promise<MultimeterMode | null> {
    if (!this.dualDisplay) return null;
    try {
      const stateRaw = await this.port.query("CALCulate:FUNCtion:STATe?");
      if (!parseBool(stateRaw)) return null;
      const raw = await this.port.query("CALCulate:FUNCtion:SEC?");
      return decodeMode(raw, this.#currentMode);
    } catch {
      return null;
    }
  }

  async setDualDisplay(secondary: MultimeterMode | null): Promise<void> {
    if (!this.dualDisplay) return;
    if (secondary === null) {
      await this.port.write("CALCulate:FUNCtion:STATe OFF");
      return;
    }
    const scpi = this.#requireScpi(secondary);
    await this.port.write(`CALCulate:FUNCtion:SEC ${scpi.token}`);
    await this.port.write("CALCulate:FUNCtion:STATe ON");
  }

  async getTemperatureConfig(): Promise<MultimeterTemperatureConfig> {
    if (!this.temperature) return { unit: "celsius", transducer: "pt100" };
    try {
      const unitRaw = await this.port.query("SENSe:TEMPerature:UNIT?");
      return { unit: decodeUnit(unitRaw), transducer: "pt100" };
    } catch {
      return { unit: "celsius", transducer: "pt100" };
    }
  }

  async setTemperatureConfig(config: MultimeterTemperatureConfig): Promise<void> {
    if (!this.temperature) return;
    await this.port.write(`SENSe:TEMPerature:UNIT ${UNIT_SCPI[config.unit]}`);
    await this.port.write(
      `SENSe:TEMPerature:TRANsducer:TYPE ${TRANSDUCER_SCPI[config.transducer]}`,
    );
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

  #requireScpi(mode: MultimeterMode): TrueVoltScpi {
    const scpi = SCPI_MAP[mode];
    if (!scpi) {
      throw new Error(`Truevolt driver does not implement mode ${mode}`);
    }
    return scpi;
  }

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${this.presets.slots - 1}`,
      );
    }
  }
}

function supportsNplc(mode: MultimeterMode): boolean {
  return (
    mode === "dcVoltage" ||
    mode === "dcCurrent" ||
    mode === "resistance" ||
    mode === "fourWireResistance" ||
    mode === "temperature"
  );
}

function parseReadingValue(raw: string): { value: number; overload: boolean } {
  const trimmed = unquote(raw);
  const n = Number.parseFloat(trimmed);
  const overload = isOverload(n);
  return {
    value: overload ? (n < 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : n || 0,
    overload,
  };
}

function decodeMode(raw: string, fallback: MultimeterMode): MultimeterMode {
  const trimmed = unquote(raw).toUpperCase();
  if (trimmed.startsWith("VOLT:AC")) return "acVoltage";
  if (trimmed.startsWith("VOLT")) return "dcVoltage";
  if (trimmed.startsWith("CURR:AC")) return "acCurrent";
  if (trimmed.startsWith("CURR")) return "dcCurrent";
  if (trimmed.startsWith("FRES")) return "fourWireResistance";
  if (trimmed.startsWith("RES")) return "resistance";
  if (trimmed.startsWith("FREQ")) return "frequency";
  if (trimmed.startsWith("PER")) return "period";
  if (trimmed.startsWith("CAP")) return "capacitance";
  if (trimmed.startsWith("CONT")) return "continuity";
  if (trimmed.startsWith("DIOD")) return "diode";
  if (trimmed.startsWith("TEMP")) return "temperature";
  return fallback;
}

function decodeTriggerSource(raw: string): MultimeterTriggerSource {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("EXT")) return "external";
  if (v.startsWith("BUS")) return "bus";
  return "immediate";
}

function encodeTriggerSource(source: MultimeterTriggerSource): string {
  switch (source) {
    case "external":
      return "EXT";
    case "bus":
      return "BUS";
    case "software":
    case "immediate":
    default:
      return "IMM";
  }
}

function decodeUnit(raw: string): TemperatureUnit {
  const v = raw.trim().toUpperCase();
  if (v === "F") return "fahrenheit";
  if (v === "K") return "kelvin";
  return "celsius";
}
