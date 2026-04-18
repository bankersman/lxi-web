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
import { parseBool } from "./_shared/index.js";
import { type SdmProfile, SDM_DEFAULT } from "./sdm-profile.js";

/**
 * Siglent SDM DMM driver (SDM3045X / SDM3055 / SDM3065X / SDM3065X-SC).
 * Profile-driven per 4.2.
 *
 * Siglent SCPI for DMMs follows IEEE-488.2 / SCPI-1999 closely:
 *   - `CONFigure:<fn>` selects the mode.
 *   - `FUNCtion?` returns the active mode as `"VOLT"`, `"VOLT:AC"`,
 *     etc. (quoted on some firmwares).
 *   - `READ?` triggers + returns a reading.
 *   - `SENSe:<fn>:RANGe` / `:RANGe:AUTO` + `:NPLC` configure the
 *     front end; `SENSe:<fn>:ZERO:AUTO` toggles auto-zero.
 *   - `TRIGger:SOURce` + `SAMPle:COUNt` + `TRIGger:DELay` control
 *     triggered acquisitions; `*TRG` fires a software trigger.
 */
const TRIGGERING: MultimeterTriggerCapability = {
  sources: ["immediate", "external", "bus", "software"],
  slopes: ["positive", "negative"],
  sampleCountRange: { min: 1, max: 1_000_000 },
  delayRangeSec: { min: 0, max: 3600 },
};

type SdmScpi = {
  readonly configure: string;
  readonly sense: string;
};

const SCPI_MAP: Partial<Record<MultimeterMode, SdmScpi>> = {
  dcVoltage: { configure: "CONFigure:VOLTage:DC", sense: "SENSe:VOLTage:DC" },
  acVoltage: { configure: "CONFigure:VOLTage:AC", sense: "SENSe:VOLTage:AC" },
  dcCurrent: { configure: "CONFigure:CURRent:DC", sense: "SENSe:CURRent:DC" },
  acCurrent: { configure: "CONFigure:CURRent:AC", sense: "SENSe:CURRent:AC" },
  resistance: { configure: "CONFigure:RESistance", sense: "SENSe:RESistance" },
  fourWireResistance: {
    configure: "CONFigure:FRESistance",
    sense: "SENSe:FRESistance",
  },
  frequency: { configure: "CONFigure:FREQuency", sense: "SENSe:FREQuency" },
  period: { configure: "CONFigure:PERiod", sense: "SENSe:PERiod" },
  capacitance: { configure: "CONFigure:CAPacitance", sense: "SENSe:CAPacitance" },
  continuity: { configure: "CONFigure:CONTinuity", sense: "SENSe:CONTinuity" },
  diode: { configure: "CONFigure:DIODe", sense: "SENSe:DIODe" },
  temperature: { configure: "CONFigure:TEMPerature", sense: "SENSe:TEMPerature" },
};

const TRANSDUCER_SCPI: Record<TemperatureTransducer, string> = {
  pt100: "RTD,PT100",
  pt1000: "RTD,PT1000",
  "thermocouple-k": "TC,K",
  "thermocouple-j": "TC,J",
  "thermocouple-t": "TC,T",
  "thermocouple-e": "TC,E",
  thermistor: "THER,10000",
};

const UNIT_SCPI: Record<TemperatureUnit, string> = {
  celsius: "C",
  fahrenheit: "F",
  kelvin: "K",
};

export class SiglentSdm implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly profile: SdmProfile;
  readonly supportedModes: readonly MultimeterMode[];
  readonly ranging: MultimeterRangingCapability;
  readonly triggering = TRIGGERING;
  readonly dualDisplay: MultimeterDualDisplayCapability;
  readonly temperature: MultimeterTemperatureCapability;
  readonly presets: InstrumentPresetCapability;

  #currentMode: MultimeterMode = "dcVoltage";

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: SdmProfile = SDM_DEFAULT,
  ) {
    this.profile = profile;
    this.supportedModes = profile.modes;
    this.ranging = {
      modes: profile.modes,
      ranges: profile.ranges,
      nplc: profile.nplcOptions,
      autoZero: true,
    };
    this.dualDisplay = { pairs: profile.dualDisplayPairs };
    this.temperature = {
      units: ["celsius", "fahrenheit", "kelvin"],
      transducers: profile.transducers,
    };
    this.presets = { slots: profile.presetSlots };
  }

  async getMode(): Promise<MultimeterMode> {
    const raw = await this.port.query("FUNCtion?");
    return decodeMode(raw, this.#currentMode);
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
    if (!scpi) {
      return { mode, upper: 0, auto: true };
    }
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
    await this.port.write(`SAMPle:COUNt ${Math.max(1, Math.floor(config.sampleCount))}`);
  }

  async trigger(): Promise<void> {
    await this.port.write("*TRG");
  }

  async getDualDisplay(): Promise<MultimeterMode | null> {
    try {
      const raw = await this.port.query("CALCulate:FUNCtion:SEC?");
      const trimmed = raw.trim().toUpperCase();
      if (trimmed === "OFF" || trimmed === "0" || trimmed === "NONE") return null;
      return decodeMode(trimmed, this.#currentMode);
    } catch {
      return null;
    }
  }

  async setDualDisplay(secondary: MultimeterMode | null): Promise<void> {
    if (secondary === null) {
      await this.port.write("CALCulate:FUNCtion:STATe OFF");
      return;
    }
    const scpi = this.#requireScpi(secondary);
    // Siglent SDMs expose secondary display via
    // CALCulate:FUNCtion:SEC <mode>; fall back to string prefix.
    const tag = scpi.sense.split(":").slice(-1)[0];
    await this.port.write(`CALCulate:FUNCtion:SEC ${tag}`);
    await this.port.write("CALCulate:FUNCtion:STATe ON");
  }

  async getTemperatureConfig(): Promise<MultimeterTemperatureConfig> {
    try {
      const [unitRaw] = await Promise.all([
        this.port.query("SENSe:TEMPerature:UNIT?"),
      ]);
      return {
        unit: decodeUnit(unitRaw),
        transducer: "pt100",
      };
    } catch {
      return { unit: "celsius", transducer: "pt100" };
    }
  }

  async setTemperatureConfig(config: MultimeterTemperatureConfig): Promise<void> {
    await this.port.write(`SENSe:TEMPerature:UNIT ${UNIT_SCPI[config.unit]}`);
    await this.port.write(`SENSe:TEMPerature:TRANsducer:TYPE ${TRANSDUCER_SCPI[config.transducer]}`);
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

  #requireScpi(mode: MultimeterMode): SdmScpi {
    const scpi = SCPI_MAP[mode];
    if (!scpi) {
      throw new Error(`SDM driver does not implement mode ${mode}`);
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
    mode === "fourWireResistance"
  );
}

function parseReadingValue(raw: string): { value: number; overload: boolean } {
  const trimmed = raw.trim().replace(/^"|"$/g, "");
  const n = Number.parseFloat(trimmed);
  // SCPI overload convention: 9.9e37 or +/-9.91e37.
  const overload = Math.abs(n) > 1e36;
  return { value: overload ? Number.POSITIVE_INFINITY : n || 0, overload };
}

function decodeMode(raw: string, fallback: MultimeterMode): MultimeterMode {
  const trimmed = raw
    .trim()
    .replace(/^"|"$/g, "")
    .toUpperCase();
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
  if (v.startsWith("IMM")) return "immediate";
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
