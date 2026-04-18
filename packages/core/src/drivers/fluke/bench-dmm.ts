import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type InstrumentPresetCapability,
  type MultimeterDualDisplayCapability,
  type MultimeterDualReading,
  type MultimeterMathCapability,
  type MultimeterMathConfig,
  type MultimeterMathState,
  type MultimeterMode,
  type MultimeterRangeState,
  type MultimeterRangingCapability,
  type MultimeterReading,
} from "../../facades/multimeter.js";
import {
  parseBool,
  parseNumberOrZero,
  safeQuery,
  unquote,
} from "./_shared/index.js";
import {
  type BenchDmmProfile,
  BENCH_DMM_DEFAULT,
} from "./bench-dmm-profile.js";

interface FlukeScpi {
  readonly configure: string;
  readonly sense: string;
  readonly token: string;
}

/**
 * Fluke SCPI shape closely matches IVI-4.8, but the 8508A and older
 * 8808A firmware omit the leading colon on function names (`VOLT:DC`
 * rather than `:VOLT:DC`). We keep colonless forms — the session adds
 * the trailing terminator, not a leading prefix.
 */
const SCPI_BY_MODE: Partial<Record<MultimeterMode, FlukeScpi>> = {
  dcVoltage: { configure: "CONFigure:VOLTage:DC AUTO", sense: "SENSe:VOLTage:DC", token: "VOLT" },
  acVoltage: { configure: "CONFigure:VOLTage:AC AUTO", sense: "SENSe:VOLTage:AC", token: "VOLT:AC" },
  dcCurrent: { configure: "CONFigure:CURRent:DC AUTO", sense: "SENSe:CURRent:DC", token: "CURR" },
  acCurrent: { configure: "CONFigure:CURRent:AC AUTO", sense: "SENSe:CURRent:AC", token: "CURR:AC" },
  resistance: { configure: "CONFigure:RESistance AUTO", sense: "SENSe:RESistance", token: "RES" },
  fourWireResistance: {
    configure: "CONFigure:FRESistance AUTO",
    sense: "SENSe:FRESistance",
    token: "FRES",
  },
  frequency: { configure: "CONFigure:FREQuency", sense: "SENSe:FREQuency", token: "FREQ" },
  period: { configure: "CONFigure:PERiod", sense: "SENSe:PERiod", token: "PER" },
  capacitance: {
    configure: "CONFigure:CAPacitance AUTO",
    sense: "SENSe:CAPacitance",
    token: "CAP",
  },
  continuity: { configure: "CONFigure:CONTinuity", sense: "SENSe:CONTinuity", token: "CONT" },
  diode: { configure: "CONFigure:DIODe", sense: "SENSe:DIODe", token: "DIOD" },
  temperature: {
    configure: "CONFigure:TEMPerature",
    sense: "SENSe:TEMPerature",
    token: "TEMP",
  },
};

/**
 * Fluke 8000 / 8800 / 8500 bench-DMM driver.
 *
 * Surfaces the IVI-4.8 subset Fluke firmware actually implements:
 *   - mode (`CONFigure:*` + `SENSe:FUNCtion?`),
 *   - read (`READ?`),
 *   - range (`SENSe:<fn>:RANGe[:AUTO]`),
 *   - NPLC (`SENSe:<fn>:NPLC`),
 *   - basic math (`CALCulate:FUNCtion` + `:STATe`) — null, db, dbm,
 *     stats, limit — gated by the profile's `mathFunctions` list,
 *   - dual display (8845A / 8846A) via `DISPlay:WINDow2:FUNCtion`,
 *   - preset memory (`*SAV` / `*RCL`).
 *
 * Temperature / logging / triggering are deferred until a community
 * report lands — Fluke metrology firmware (8588A / 8508A) rejects
 * several IVI-standard header forms with `-113 Undefined header`, so
 * we stick to the common core to avoid wedging a real device.
 */
export class FlukeBenchDmm implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly profile: BenchDmmProfile;
  readonly supportedModes: readonly MultimeterMode[];
  readonly ranging: MultimeterRangingCapability;
  readonly math: MultimeterMathCapability;
  readonly dualDisplay?: MultimeterDualDisplayCapability;
  readonly presets: InstrumentPresetCapability;

  #currentMode: MultimeterMode = "dcVoltage";
  #mathConfig: MultimeterMathConfig = { function: "none" };

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: BenchDmmProfile = BENCH_DMM_DEFAULT,
  ) {
    this.profile = profile;
    this.supportedModes = profile.modes;
    this.ranging = {
      modes: profile.modes,
      ranges: profile.ranges,
      nplc: profile.nplcOptions,
      autoZero: profile.family !== "8000",
    };
    const voltageOnly = profile.modes.filter(
      (m) => m === "dcVoltage" || m === "acVoltage",
    );
    this.math = {
      functions: profile.mathFunctions,
      allowedModes: {
        none: profile.modes,
        null: profile.modes,
        stats: profile.modes,
        limit: profile.modes,
        db: voltageOnly,
        dbm: voltageOnly,
      },
      dbmReferences: [50, 75, 600],
    };
    if (profile.hasDualDisplay) {
      const pairs: Partial<Record<MultimeterMode, readonly MultimeterMode[]>> = {};
      for (const primary of profile.modes) {
        pairs[primary] = profile.modes.filter((m) => m !== primary);
      }
      this.dualDisplay = { pairs };
    }
    this.presets = { slots: profile.presetSlots };
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
    const overload = !Number.isFinite(value) || Math.abs(value) >= 9.9e37;
    return {
      value: overload ? Number.NaN : value,
      unit: DEFAULT_MULTIMETER_UNITS[mode],
      mode,
      measuredAt: Date.now(),
      overload,
    };
  }

  async getRange(): Promise<MultimeterRangeState> {
    const mode = await this.getMode();
    const scpi = SCPI_BY_MODE[mode];
    if (!scpi) return { mode, upper: 0, auto: true };
    const [upperRaw, autoRaw] = await Promise.all([
      safeQuery(this.port, `${scpi.sense}:RANGe?`),
      safeQuery(this.port, `${scpi.sense}:RANGe:AUTO?`),
    ]);
    return {
      mode,
      upper: parseNumberOrZero(upperRaw),
      auto: parseBool(autoRaw),
    };
  }

  async setRange(mode: MultimeterMode, range: number | "auto"): Promise<void> {
    const scpi = this.#requireScpi(mode);
    if (range === "auto") {
      await this.port.write(`${scpi.sense}:RANGe:AUTO ON`);
      return;
    }
    if (!Number.isFinite(range) || range <= 0) {
      throw new Error(`invalid range ${range}`);
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

  async getMath(): Promise<MultimeterMathState> {
    const [stateRaw, fnRaw] = await Promise.all([
      safeQuery(this.port, "CALCulate:STATe?"),
      safeQuery(this.port, "CALCulate:FUNCtion?"),
    ]);
    if (!parseBool(stateRaw)) return { config: { function: "none" } };
    const fn = decodeMathFunction(unquote(fnRaw));
    return { config: { ...this.#mathConfig, function: fn } };
  }

  async setMath(config: MultimeterMathConfig): Promise<void> {
    if (!this.math.functions.includes(config.function)) {
      throw new Error(
        `Fluke ${this.profile.variant} does not support math '${config.function}'`,
      );
    }
    this.#mathConfig = config;
    if (config.function === "none") {
      await this.port.write("CALCulate:STATe OFF");
      return;
    }
    await this.port.write(
      `CALCulate:FUNCtion ${encodeMathFunction(config.function)}`,
    );
    await this.port.write("CALCulate:STATe ON");
    if (config.function === "null" && config.nullOffset !== undefined) {
      await this.port.write(`CALCulate:NULL:OFFSet ${config.nullOffset}`);
    }
    if (config.function === "dbm" && config.dbmReference !== undefined) {
      await this.port.write(`CALCulate:DBM:REFerence ${config.dbmReference}`);
    }
    if (config.function === "limit") {
      if (config.limitUpper !== undefined) {
        await this.port.write(`CALCulate:LIMit:UPPer ${config.limitUpper}`);
      }
      if (config.limitLower !== undefined) {
        await this.port.write(`CALCulate:LIMit:LOWer ${config.limitLower}`);
      }
    }
  }

  async fetchMathState(): Promise<MultimeterMathState> {
    return this.getMath();
  }

  async resetMathStatistics(): Promise<void> {
    await this.port.write("CALCulate:AVERage:CLEar");
  }

  async getDualDisplay(): Promise<MultimeterMode | null> {
    if (!this.dualDisplay) return null;
    const [stateRaw, fnRaw] = await Promise.all([
      safeQuery(this.port, "DISPlay:WINDow2:STATe?"),
      safeQuery(this.port, "DISPlay:WINDow2:FUNCtion?"),
    ]);
    if (!parseBool(stateRaw)) return null;
    const decoded = decodeMode(unquote(fnRaw), this.#currentMode);
    return decoded;
  }

  async setDualDisplay(secondary: MultimeterMode | null): Promise<void> {
    if (!this.dualDisplay) {
      throw new Error(
        `Fluke ${this.profile.variant} does not support dual display`,
      );
    }
    if (secondary === null) {
      await this.port.write("DISPlay:WINDow2:STATe OFF");
      return;
    }
    const scpi = this.#requireScpi(secondary);
    await this.port.write(`DISPlay:WINDow2:FUNCtion ${scpi.token}`);
    await this.port.write("DISPlay:WINDow2:STATe ON");
  }

  async readDual(): Promise<MultimeterDualReading> {
    if (!this.dualDisplay) {
      throw new Error(
        `Fluke ${this.profile.variant} does not support dual display`,
      );
    }
    const primary = await this.read();
    const [secondaryRaw, secondaryMode] = await Promise.all([
      safeQuery(this.port, "READ:SECondary?"),
      this.getDualDisplay(),
    ]);
    const mode = secondaryMode ?? primary.mode;
    const value = parseNumberOrZero(secondaryRaw);
    return {
      primary,
      secondary: {
        value,
        unit: DEFAULT_MULTIMETER_UNITS[mode],
        mode,
        measuredAt: Date.now(),
        overload: !Number.isFinite(value) || Math.abs(value) >= 9.9e37,
      },
    };
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
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

  #requireScpi(mode: MultimeterMode): FlukeScpi {
    if (!this.supportedModes.includes(mode)) {
      throw new Error(
        `Fluke ${this.profile.variant} does not support mode ${mode}`,
      );
    }
    const scpi = SCPI_BY_MODE[mode];
    if (!scpi) throw new Error(`mode '${mode}' has no SCPI binding`);
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

function decodeMode(raw: string, fallback: MultimeterMode): MultimeterMode {
  const token = raw.trim().toUpperCase();
  if (!token) return fallback;
  if (token.startsWith("VOLT:AC") || token === "VAC") return "acVoltage";
  if (token.startsWith("VOLT")) return "dcVoltage";
  if (token.startsWith("CURR:AC") || token === "IAC") return "acCurrent";
  if (token.startsWith("CURR")) return "dcCurrent";
  if (token.startsWith("FRES") || token === "F4W") return "fourWireResistance";
  if (token.startsWith("RES")) return "resistance";
  if (token.startsWith("FREQ")) return "frequency";
  if (token.startsWith("PER")) return "period";
  if (token.startsWith("CAP")) return "capacitance";
  if (token.startsWith("CONT")) return "continuity";
  if (token.startsWith("DIOD")) return "diode";
  if (token.startsWith("TEMP")) return "temperature";
  return fallback;
}

const MATH_FN_TO_SCPI: Record<string, string> = {
  null: "NULL",
  db: "DB",
  dbm: "DBM",
  stats: "AVERage",
  limit: "LIMit",
};

function encodeMathFunction(fn: string): string {
  return MATH_FN_TO_SCPI[fn] ?? "NONE";
}

function decodeMathFunction(raw: string): "none" | "null" | "db" | "dbm" | "stats" | "limit" {
  const token = raw.trim().toUpperCase();
  if (token.startsWith("NULL")) return "null";
  if (token === "DB") return "db";
  if (token === "DBM") return "dbm";
  if (token.startsWith("AVER")) return "stats";
  if (token.startsWith("LIM")) return "limit";
  return "none";
}
