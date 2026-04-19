/**
 * Rigol DM858 / DM858E driver. SCPI must match `docs/vendor/rigol/DM858_SCPI_API_Reference.md`;
 * undefined headers cause execution errors and audible beeps on the instrument.
 */
import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type InstrumentPresetCapability,
  type MultimeterDualDisplayCapability,
  type MultimeterDualReading,
  type MultimeterLoggingCapability,
  type MultimeterLoggingConfig,
  type MultimeterLoggingSample,
  type MultimeterLoggingStatus,
  type MultimeterMathCapability,
  type MultimeterMathConfig,
  type MultimeterMathState,
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
import { type Dm800Profile, DM800_DEFAULT } from "./dm800-profile.js";
import { parseBool } from "./_shared/index.js";

/**
 * §3.20 — only `TRIGger:SOURce` and `TRIGger:COUNt` are documented; `TRIGger:SLOPe`
 * / `TRIGger:DELay` are not in the DM858 reference (do not emit).
 */
const TRIGGERING: MultimeterTriggerCapability = {
  sources: ["immediate", "external", "bus", "software"],
  slopes: ["positive", "negative"],
  sampleCountRange: { min: 1, max: 2000 },
  delayRangeSec: { min: 0, max: 0 },
};

const LOGGING: MultimeterLoggingCapability = {
  maxSamples: 1_000_000,
  minIntervalMs: 50,
};

const OPTIONAL_TIMEOUT_MS = 800;

type DmmScpi = {
  readonly configure: string;
  /**
   * `[SENSe]:…` subtree when documented in §3.17. Omit for CONTinuity / DIODe / TEMPerature
   * (those use `CONFigure` / `MEASure` / `UNIT` only on DM858).
   */
  readonly sense?: string;
  /**
   * Subtree for `RANGe` / `RANGe:AUTO`. Frequency and period use `…:VOLTage:RANGe`
   * (doc §3.17.26–27 / §3.17.41–42), not `FREQuency:RANGe` / `PERiod:RANGe`.
   */
  readonly rangeSense?: string;
};

function rangeScpiPrefix(entry: DmmScpi): string {
  return entry.rangeSense ?? entry.sense!;
}

const SCPI_MAP: Partial<Record<MultimeterMode, DmmScpi>> = {
  dcVoltage: { configure: ":CONFigure:VOLTage:DC AUTO", sense: ":SENSe:VOLTage:DC" },
  acVoltage: { configure: ":CONFigure:VOLTage:AC AUTO", sense: ":SENSe:VOLTage:AC" },
  dcCurrent: { configure: ":CONFigure:CURRent:DC AUTO", sense: ":SENSe:CURRent:DC" },
  acCurrent: { configure: ":CONFigure:CURRent:AC AUTO", sense: ":SENSe:CURRent:AC" },
  resistance: { configure: ":CONFigure:RESistance AUTO", sense: ":SENSe:RESistance" },
  fourWireResistance: {
    configure: ":CONFigure:FRESistance AUTO",
    sense: ":SENSe:FRESistance",
  },
  frequency: {
    configure: ":CONFigure:FREQuency",
    sense: ":SENSe:FREQuency",
    rangeSense: ":SENSe:FREQuency:VOLTage",
  },
  period: {
    configure: ":CONFigure:PERiod",
    sense: ":SENSe:PERiod",
    rangeSense: ":SENSe:PERiod:VOLTage",
  },
  capacitance: {
    configure: ":CONFigure:CAPacitance AUTO",
    sense: ":SENSe:CAPacitance",
  },
  continuity: { configure: ":CONFigure:CONTinuity" },
  diode: { configure: ":CONFigure:DIODe" },
  temperature: { configure: ":CONFigure:TEMPerature" },
};

/** Doc §3.17 — only `VOLTage:DC`, `CURRent:DC`, `RESistance`, `FRESistance` define `[SENSe]:…:NPLC` (no AC V/I). */
const MODES_WITH_NPLC: ReadonlySet<MultimeterMode> = new Set([
  "dcVoltage",
  "dcCurrent",
  "resistance",
  "fourWireResistance",
]);

/** Doc §3.10.10 / §3.15.10 — probe + type as `CONFigure:TEMPerature` arguments (not `SENSe:TEMPerature:…`). */
function encodeTemperatureConfigure(config: MultimeterTemperatureConfig): string {
  switch (config.transducer) {
    case "pt100":
    case "pt1000":
      return "RTD,385";
    case "thermistor":
      return "FTHermistor,5000";
    case "thermocouple-k":
      return "TCouple,K";
    case "thermocouple-j":
      return "TCouple,J";
    case "thermocouple-t":
      return "TCouple,T";
    case "thermocouple-e":
      return "TCouple,E";
    default:
      return "TCouple,K";
  }
}

/**
 * Parse `CONFigure?` temperature line (§3.10.13). Firmware often returns **abbreviated**
 * probe mnemonics (e.g. `TC` for `TCouple`, `FTH` for `FTHermistor`), not the full
 * `CONFigure:TEMPerature` spellings.
 */
function parseTemperatureTransducerFromConfigure(raw: string): TemperatureTransducer {
  const s = raw.trim().replace(/^"|"$/g, "");
  const u = s.toUpperCase();
  if (!u.startsWith("TEMP")) return "pt100";
  const rest = s.slice(4).trim();
  const parts = rest
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0);
  const probe = parts[0] ?? "";
  const typeArg = parts[1] ?? "";

  // TCouple — query often `TEMP TC,K` not `TEMP TCouple,K`
  if (probe === "TC" || probe.startsWith("TCOUPLE")) {
    if (typeArg === "K") return "thermocouple-k";
    if (typeArg === "J") return "thermocouple-j";
    if (typeArg === "T") return "thermocouple-t";
    if (typeArg === "E") return "thermocouple-e";
    return "thermocouple-k";
  }

  // FTHermistor — abbreviated `FTH`
  if (probe === "FTH" || probe.startsWith("FTHERM") || probe.includes("FTHERMISTOR")) {
    return "thermistor";
  }
  if (probe === "THER" || probe.startsWith("THERM")) {
    return "thermistor";
  }

  // RTD / FRTD — sometimes shortened (e.g. leading letters only)
  if (
    probe === "RTD" ||
    probe === "FRTD" ||
    probe === "RT" ||
    probe.startsWith("RTD") ||
    probe.startsWith("FRTD")
  ) {
    if (/1000/.test(rest) || typeArg.includes("1000")) return "pt1000";
    return "pt100";
  }

  return "pt100";
}

const UNIT_MAP: Record<TemperatureUnit, string> = {
  celsius: "C",
  fahrenheit: "F",
  kelvin: "K",
};

const UNIT_FROM_SCPI: Record<string, TemperatureUnit> = {
  C: "celsius",
  CEL: "celsius",
  F: "fahrenheit",
  FAR: "fahrenheit",
  K: "kelvin",
  KEL: "kelvin",
};

/** §3.17 — `<second>` tokens as in examples (`"FREQ"`, `"PER"`, `"VOLTage:AC"`). */
const SECONDARY_WRITE: Partial<
  Record<MultimeterMode, Partial<Record<MultimeterMode, string>>>
> = {
  acVoltage: {
    frequency: "FREQ",
    period: "PER",
  },
  acCurrent: {
    frequency: "FREQ",
    period: "PER",
  },
  frequency: { acVoltage: "VOLTage:AC" },
  period: { acVoltage: "VOLTage:AC" },
};

interface LoggingRun {
  readonly runId: string;
  readonly config: MultimeterLoggingConfig;
  readonly startedAt: number;
  samplesEmitted: number;
  readonly samples: MultimeterLoggingSample[];
  timer: ReturnType<typeof setInterval> | null;
  stopped: boolean;
  inflight: boolean;
}

/** Rigol DM800-family bench DMM driver (DM858 / DM858E). */
export class RigolDm800 implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly profile: Dm800Profile;
  readonly supportedModes: readonly MultimeterMode[];
  readonly ranging: MultimeterRangingCapability;
  readonly triggering = TRIGGERING;
  readonly math: MultimeterMathCapability;
  readonly dualDisplay: MultimeterDualDisplayCapability;
  readonly logging = LOGGING;
  readonly temperature: MultimeterTemperatureCapability;
  readonly presets: InstrumentPresetCapability;

  #mathConfig: MultimeterMathConfig = { function: "none" };
  #run: LoggingRun | null = null;
  /** Used to apply DM858 rule: dB/dBm scaling resets when the measurement function changes. */
  #lastModeForMath?: MultimeterMode;
  /** Last known temp settings from device (updated in temperature mode). */
  #tempCache: MultimeterTemperatureConfig = { unit: "celsius", transducer: "pt100" };

  /** Front-panel function changes: scaling resets (doc §3.9); drop dB/dBm cache when `SENSe:FUNCtion?` diverges from what we last saw. */
  #onMeasurementFunctionChanged(mode: MultimeterMode): void {
    if (this.#lastModeForMath !== undefined && this.#lastModeForMath !== mode) {
      if (this.#mathConfig.function === "db" || this.#mathConfig.function === "dbm") {
        this.#mathConfig = { function: "none" };
      }
    }
    this.#lastModeForMath = mode;
  }

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: Dm800Profile = DM800_DEFAULT,
  ) {
    this.profile = profile;
    this.supportedModes = profile.modes;
    this.ranging = {
      modes: profile.modes,
      ranges: profile.ranges,
      nplc: profile.nplcOptions,
      autoZero: false,
    };
    const voltageOnly = profile.modes.filter(
      (m) => m === "dcVoltage" || m === "acVoltage",
    );
    this.math = {
      functions: ["none", "null", "db", "dbm", "stats", "limit"],
      allowedModes: {
        none: profile.modes,
        null: profile.modes,
        stats: profile.modes,
        limit: profile.modes,
        db: voltageOnly,
        dbm: voltageOnly,
      },
      dbmReferences: profile.dbmReferences,
    };
    this.dualDisplay = { pairs: profile.dualDisplayPairs };
    this.temperature = {
      units: ["celsius", "fahrenheit", "kelvin"],
      transducers: profile.transducers,
    };
    this.presets = { slots: profile.presetSlots };
  }

  async #queryOpt(command: string, fallback: string): Promise<string> {
    try {
      return await this.port.query(command, { timeoutMs: OPTIONAL_TIMEOUT_MS });
    } catch {
      return fallback;
    }
  }

  async getMode(): Promise<MultimeterMode> {
    const raw = await this.port.query(":SENSe:FUNCtion?");
    return parseMode(raw);
  }

  async setMode(mode: MultimeterMode): Promise<void> {
    const entry = SCPI_MAP[mode];
    if (!entry) throw new Error(`mode '${mode}' is not supported`);
    await this.port.write(entry.configure);
    // CONFigure selects a new measurement function; dB/dBm scaling is cleared on the instrument (doc §3.9).
    if (this.#mathConfig.function === "db" || this.#mathConfig.function === "dbm") {
      this.#mathConfig = { function: "none" };
    }
    this.#lastModeForMath = mode;
  }

  async read(): Promise<MultimeterReading> {
    const [raw, modeStr] = await Promise.all([
      this.port.query(":READ?", { timeoutMs: 10_000 }),
      this.port.query(":SENSe:FUNCtion?"),
    ]);
    const mode = parseMode(modeStr);
    const value = Number.parseFloat(raw.trim());
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
    const entry = SCPI_MAP[mode];
    if (!entry) return { mode, upper: 0, auto: true };
    if (!entry.sense) {
      return { mode, upper: 0, auto: true };
    }
    const rp = rangeScpiPrefix(entry);
    const [upperRaw, autoRaw] = await Promise.all([
      this.#queryOpt(`${rp}:RANGe?`, "0"),
      this.#queryOpt(`${rp}:RANGe:AUTO?`, "1"),
    ]);
    const upper = Number.parseFloat(upperRaw) || 0;
    const auto = parseBool(autoRaw);
    return { mode, upper, auto };
  }

  async setRange(mode: MultimeterMode, range: number | "auto"): Promise<void> {
    const entry = SCPI_MAP[mode];
    if (!entry) throw new Error(`mode '${mode}' is not supported`);
    if (!entry.sense) {
      throw new Error(
        `mode '${mode}' has no [SENSe]:…:RANGe on DM858 — preset range with :CONFigure:… only`,
      );
    }
    const rp = rangeScpiPrefix(entry);
    if (range === "auto") {
      await this.port.write(`${rp}:RANGe:AUTO ON`);
      return;
    }
    if (!Number.isFinite(range) || range <= 0) {
      throw new Error(`invalid range ${range}`);
    }
    await this.port.write(`${rp}:RANGe:AUTO OFF`);
    await this.port.write(`${rp}:RANGe ${range}`);
  }

  async getNplc(): Promise<number> {
    const mode = await this.getMode();
    if (!MODES_WITH_NPLC.has(mode)) {
      throw new Error(`mode '${mode}' has no NPLC command on DM800 (DC V, DC I, 2 Ω, 4 Ω only)`);
    }
    const entry = SCPI_MAP[mode];
    if (!entry) return 20;
    const raw = await this.#queryOpt(`${entry.sense!}:NPLC?`, "20");
    return Number.parseFloat(raw) || 20;
  }

  async setNplc(value: number): Promise<void> {
    const mode = await this.getMode();
    if (!MODES_WITH_NPLC.has(mode)) {
      throw new Error(`mode '${mode}' has no NPLC command on DM800 (DC V, DC I, 2 Ω, 4 Ω only)`);
    }
    const entry = SCPI_MAP[mode];
    if (!entry) throw new Error(`mode '${mode}' has no NPLC setting`);
    await this.port.write(`${entry.sense!}:NPLC ${value}`);
  }

  async getTriggerConfig(): Promise<MultimeterTriggerConfig> {
    const [sourceRaw, sampleRaw] = await Promise.all([
      this.#queryOpt(":TRIGger:SOURce?", "IMM"),
      this.#queryOpt(":SAMPle:COUNt?", "1"),
    ]);
    return {
      source: parseTriggerSource(sourceRaw),
      slope: "positive",
      delaySec: 0,
      sampleCount: Math.max(1, Math.round(Number.parseFloat(sampleRaw) || 1)),
    };
  }

  async setTriggerConfig(config: MultimeterTriggerConfig): Promise<void> {
    await this.port.write(`:TRIGger:SOURce ${encodeTriggerSource(config.source)}`);
    await this.port.write(`:SAMPle:COUNt ${Math.max(1, Math.round(config.sampleCount))}`);
    await this.port.write(":TRIGger:COUNt 1");
  }

  async trigger(): Promise<void> {
    await this.port.write("*TRG");
  }

  async getMath(): Promise<MultimeterMathState> {
    const mode = await this.getMode();
    this.#onMeasurementFunctionChanged(mode);
    const entry = SCPI_MAP[mode];
    const senseForNull = entry?.sense;
    const [avgOn, limOn, nullOn] = await Promise.all([
      this.#queryOpt(":CALCulate:AVERage:STATe?", "0"),
      this.#queryOpt(":CALCulate:LIMit:STATe?", "0"),
      senseForNull
        ? this.#queryOpt(`${senseForNull}:NULL:STATe?`, "0")
        : Promise.resolve("0"),
    ]);
    const scaleFromCache =
      (mode === "dcVoltage" || mode === "acVoltage") &&
      (this.#mathConfig.function === "db" || this.#mathConfig.function === "dbm");

    if (parseBool(avgOn)) {
      const [min, max, avg, sd, count] = await Promise.all([
        this.port.query(":CALCulate:AVERage:MINimum?"),
        this.port.query(":CALCulate:AVERage:MAXimum?"),
        this.port.query(":CALCulate:AVERage:AVERage?"),
        this.port.query(":CALCulate:AVERage:SDEViation?"),
        this.port.query(":CALCulate:AVERage:COUNt?"),
      ]);
      this.#mathConfig = { ...this.#mathConfig, function: "stats" };
      return {
        config: this.#mathConfig,
        stats: {
          min: num(min),
          max: num(max),
          average: num(avg),
          stddev: num(sd),
          count: Math.max(0, Math.round(num(count))),
        },
      };
    }
    if (parseBool(limOn)) {
      const [upper, lower] = await Promise.all([
        this.port.query(":CALCulate:LIMit:UPPer:DATA?"),
        this.port.query(":CALCulate:LIMit:LOWer:DATA?"),
      ]);
      const reading = await this.read();
      const v = reading.value;
      let limitResult: "pass" | "fail-high" | "fail-low" = "pass";
      if (v > num(upper)) limitResult = "fail-high";
      else if (v < num(lower)) limitResult = "fail-low";
      this.#mathConfig = {
        ...this.#mathConfig,
        function: "limit",
        limitUpper: num(upper),
        limitLower: num(lower),
      };
      return {
        config: this.#mathConfig,
        limitResult,
      };
    }
    if (scaleFromCache) {
      const fn = this.#mathConfig.function;
      const isDbm = fn === "dbm";
      const refCmd = isDbm
        ? ":CALCulate:SCALe:DBM:REFerence?"
        : ":CALCulate:SCALe:DB:REFerence?";
      const ref = await this.port.query(refCmd);
      this.#mathConfig = {
        ...this.#mathConfig,
        function: fn,
        dbmReference: isDbm ? num(ref) : undefined,
        nullOffset: !isDbm ? num(ref) : undefined,
      };
      return { config: this.#mathConfig };
    }
    if (parseBool(nullOn)) {
      if (!senseForNull) {
        this.#mathConfig = { function: "none" };
        return { config: this.#mathConfig };
      }
      const off = await this.port.query(`${senseForNull}:NULL:VALue?`);
      this.#mathConfig = {
        ...this.#mathConfig,
        function: "null",
        nullOffset: num(off),
      };
      return { config: this.#mathConfig };
    }
    this.#mathConfig = { function: "none" };
    return { config: this.#mathConfig };
  }

  async setMath(config: MultimeterMathConfig): Promise<void> {
    this.#mathConfig = config;
    const mode = await this.getMode();
    const sense = SCPI_MAP[mode]?.sense;

    await this.port.write(":CALCulate:AVERage:STATe OFF");
    await this.port.write(":CALCulate:LIMit:STATe OFF");
    await this.port.write(":CALCulate:SCALe:STATe OFF");
    if (sense) {
      await this.port.write(`${sense}:NULL:STATe OFF`);
    }

    if (config.function === "none") return;

    if (config.function === "stats") {
      await this.port.write(":CALCulate:AVERage:STATe ON");
      return;
    }
    if (config.function === "limit") {
      await this.port.write(":CALCulate:LIMit:STATe ON");
      if (config.limitUpper !== undefined) {
        await this.port.write(`:CALCulate:LIMit:UPPer:DATA ${config.limitUpper}`);
      }
      if (config.limitLower !== undefined) {
        await this.port.write(`:CALCulate:LIMit:LOWer:DATA ${config.limitLower}`);
      }
      return;
    }
    if (config.function === "dbm") {
      await this.port.write(":CALCulate:SCALe:FUNCtion DBM");
      if (config.dbmReference !== undefined) {
        await this.port.write(`:CALCulate:SCALe:DBM:REFerence ${config.dbmReference}`);
      }
      await this.port.write(":CALCulate:SCALe:STATe ON");
      return;
    }
    if (config.function === "db") {
      await this.port.write(":CALCulate:SCALe:FUNCtion DB");
      if (config.nullOffset !== undefined) {
        await this.port.write(`:CALCulate:SCALe:DB:REFerence ${config.nullOffset}`);
      }
      await this.port.write(":CALCulate:SCALe:STATe ON");
      return;
    }
    if (config.function === "null") {
      if (!sense) {
        throw new Error(
          `relative (NULL) math is not available for '${mode}' on DM800 (no [SENSe]:NULL subtree)`,
        );
      }
      await this.port.write(`${sense}:NULL:STATe ON`);
      if (config.nullOffset !== undefined) {
        await this.port.write(`${sense}:NULL:VALue ${config.nullOffset}`);
      }
    }
  }

  async fetchMathState(): Promise<MultimeterMathState> {
    return this.getMath();
  }

  async resetMathStatistics(): Promise<void> {
    await this.port.write(":CALCulate:AVERage:CLEar");
  }

  async getDualDisplay(): Promise<MultimeterMode | null> {
    const mode = await this.getMode();
    const entry = SCPI_MAP[mode];
    if (!entry?.sense) return null;
    const raw = await this.#queryOpt(`${entry.sense}:SECondary?`, "OFF");
    return parseSecondaryToken(raw);
  }

  async setDualDisplay(secondary: MultimeterMode | null): Promise<void> {
    const primary = await this.getMode();
    const entry = SCPI_MAP[primary];
    if (!entry?.sense) {
      throw new Error(`mode '${primary}' has no [SENSe]:…:SECondary path on DM800`);
    }
    if (secondary === null) {
      await this.port.write(`${entry.sense}:SECondary "OFF"`);
      return;
    }
    const allowed = this.dualDisplay.pairs[primary];
    if (!allowed?.includes(secondary)) {
      throw new Error(`secondary '${secondary}' is not allowed for primary '${primary}'`);
    }
    const token = SECONDARY_WRITE[primary]?.[secondary];
    if (!token) {
      throw new Error(`no SCPI mapping for ${primary} + ${secondary}`);
    }
    await this.port.write(`${entry.sense}:SECondary "${token}"`);
  }

  async readDual(): Promise<MultimeterDualReading> {
    const primary = await this.read();
    const entry = SCPI_MAP[primary.mode];
    const secondaryRaw = await this.#queryOpt(":SENSe:DATA2?", "");
    let secondaryMode: MultimeterMode = primary.mode;
    if (entry?.sense) {
      const secTok = await this.#queryOpt(`${entry.sense}:SECondary?`, "OFF");
      const parsed = parseSecondaryToken(secTok);
      if (parsed) secondaryMode = parsed;
    }
    const value = Number.parseFloat(secondaryRaw.trim());
    return {
      primary,
      secondary: {
        value: Number.isFinite(value) ? value : Number.NaN,
        unit: DEFAULT_MULTIMETER_UNITS[secondaryMode],
        mode: secondaryMode,
        measuredAt: Date.now(),
        overload: !Number.isFinite(value) || Math.abs(value) >= 9.9e37,
      },
    };
  }

  async startLogging(config: MultimeterLoggingConfig): Promise<{ runId: string }> {
    if (this.#run && !this.#run.stopped) {
      throw new Error("a logging run is already active");
    }
    const runId = `dmm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const run: LoggingRun = {
      runId,
      config,
      startedAt: Date.now(),
      samplesEmitted: 0,
      samples: [],
      timer: null,
      stopped: false,
      inflight: false,
    };
    this.#run = run;
    run.timer = setInterval(() => {
      if (run.stopped || run.inflight) return;
      run.inflight = true;
      void this.#sampleOnce(run).finally(() => {
        run.inflight = false;
        if (
          run.config.totalSamples !== undefined &&
          run.samplesEmitted >= run.config.totalSamples
        ) {
          this.#stopRun(run);
        }
      });
    }, Math.max(config.intervalMs, LOGGING.minIntervalMs));
    return { runId };
  }

  async stopLogging(): Promise<void> {
    if (this.#run) this.#stopRun(this.#run);
  }

  async getLoggingStatus(): Promise<MultimeterLoggingStatus> {
    const run = this.#run;
    if (!run) {
      return { running: false, samplesEmitted: 0 };
    }
    const samplesRemaining =
      run.config.totalSamples !== undefined
        ? Math.max(0, run.config.totalSamples - run.samplesEmitted)
        : undefined;
    return {
      running: !run.stopped,
      runId: run.runId,
      config: run.config,
      samplesEmitted: run.samplesEmitted,
      samplesRemaining,
      startedAt: run.startedAt,
    };
  }

  async fetchLoggedSamples(
    runId: string,
    since?: number,
  ): Promise<readonly MultimeterLoggingSample[]> {
    const run = this.#run;
    if (!run || run.runId !== runId) return [];
    const cutoff = since ?? -1;
    return run.samples.filter((s) => s.seq > cutoff);
  }

  async getTemperatureConfig(): Promise<MultimeterTemperatureConfig> {
    const mode = await this.getMode();
    if (mode !== "temperature") {
      return { ...this.#tempCache };
    }
    const [unitRaw, cfgRaw] = await Promise.all([
      this.port.query(":UNIT:TEMPerature?"),
      this.#queryOpt(":CONFigure?", "TEMP RTD,385"),
    ]);
    const unit = UNIT_FROM_SCPI[unitRaw.trim().toUpperCase()] ?? "celsius";
    const transducer = parseTemperatureTransducerFromConfigure(cfgRaw);
    this.#tempCache = { unit, transducer };
    return { unit, transducer };
  }

  async setTemperatureConfig(config: MultimeterTemperatureConfig): Promise<void> {
    await this.port.write(`:UNIT:TEMPerature ${UNIT_MAP[config.unit]}`);
    await this.port.write(`:CONFigure:TEMPerature ${encodeTemperatureConfigure(config)}`);
    this.#tempCache = { unit: config.unit, transducer: config.transducer };
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

  #assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.presets.slots) {
      throw new RangeError(`preset slot must be 0..${this.presets.slots - 1}`);
    }
  }

  async #sampleOnce(run: LoggingRun): Promise<void> {
    try {
      const reading = await this.read();
      run.samplesEmitted += 1;
      const sample: MultimeterLoggingSample = {
        seq: run.samplesEmitted,
        value: reading.value,
        unit: reading.unit,
        mode: reading.mode,
        timestamp: reading.measuredAt,
        elapsedMs: reading.measuredAt - run.startedAt,
      };
      run.samples.push(sample);
      if (run.samples.length > LOGGING.maxSamples) {
        run.samples.splice(0, run.samples.length - LOGGING.maxSamples);
      }
    } catch {
      // ignore
    }
  }

  #stopRun(run: LoggingRun): void {
    run.stopped = true;
    if (run.timer) {
      clearInterval(run.timer);
      run.timer = null;
    }
  }
}

export function parseMode(raw: string): MultimeterMode {
  const trimmed = raw.trim().replace(/^"|"$/g, "").toUpperCase();
  if (/^VOLT:AC/.test(trimmed)) return "acVoltage";
  if (/^VOLT/.test(trimmed)) return "dcVoltage";
  if (/^CURR:AC/.test(trimmed)) return "acCurrent";
  if (/^CURR/.test(trimmed)) return "dcCurrent";
  if (/^FRES/.test(trimmed)) return "fourWireResistance";
  if (/^RES/.test(trimmed)) return "resistance";
  if (/^FREQ/.test(trimmed)) return "frequency";
  if (/^PER/.test(trimmed)) return "period";
  if (/^CAP/.test(trimmed)) return "capacitance";
  if (/^CONT/.test(trimmed)) return "continuity";
  if (/^DIOD/.test(trimmed)) return "diode";
  if (/^TEMP/.test(trimmed)) return "temperature";
  return "dcVoltage";
}

function parseSecondaryToken(raw: string): MultimeterMode | null {
  const t = raw.trim().replace(/^"|"$/g, "").toUpperCase();
  if (!t || t === "OFF") return null;
  if (t === "FREQ" || t.includes("FREQ")) return "frequency";
  if (t === "PER" || (t.includes("PER") && !t.includes("TEMP"))) return "period";
  if (t.includes("VOLT") && t.includes("AC")) return "acVoltage";
  return null;
}

function num(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseTriggerSource(raw: string): MultimeterTriggerSource {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("EXT")) return "external";
  if (v.startsWith("BUS")) return "bus";
  return "immediate";
}

function encodeTriggerSource(source: MultimeterTriggerSource): string {
  switch (source) {
    case "external":
      return "EXTernal";
    case "bus":
    case "software":
      return "BUS";
    default:
      return "IMMediate";
  }
}
