import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type InstrumentPresetCapability,
  type MultimeterAutoZero,
  type MultimeterDualDisplayCapability,
  type MultimeterDualReading,
  type MultimeterLoggingCapability,
  type MultimeterLoggingConfig,
  type MultimeterLoggingSample,
  type MultimeterLoggingStatus,
  type MultimeterMathCapability,
  type MultimeterMathConfig,
  type MultimeterMathFunction,
  type MultimeterMathState,
  type MultimeterMode,
  type MultimeterRange,
  type MultimeterRangeState,
  type MultimeterRangingCapability,
  type MultimeterReading,
  type MultimeterTemperatureCapability,
  type MultimeterTemperatureConfig,
  type MultimeterTriggerCapability,
  type MultimeterTriggerConfig,
  type MultimeterTriggerSlope,
  type MultimeterTriggerSource,
  type TemperatureTransducer,
  type TemperatureUnit,
} from "../../facades/multimeter.js";

const SUPPORTED_MODES: readonly MultimeterMode[] = [
  "dcVoltage",
  "acVoltage",
  "dcCurrent",
  "acCurrent",
  "resistance",
  "fourWireResistance",
  "frequency",
  "period",
  "capacitance",
  "continuity",
  "diode",
  "temperature",
];

// DM858 per-mode range lists (upper limits in base units) from the
// programming guide. Capacitance / frequency use auto-ranging only.
const RANGES: Partial<Record<MultimeterMode, readonly MultimeterRange[]>> = {
  dcVoltage: [
    { label: "200 mV", upper: 0.2 },
    { label: "2 V", upper: 2 },
    { label: "20 V", upper: 20 },
    { label: "200 V", upper: 200 },
    { label: "1000 V", upper: 1000 },
  ],
  acVoltage: [
    { label: "200 mV", upper: 0.2 },
    { label: "2 V", upper: 2 },
    { label: "20 V", upper: 20 },
    { label: "200 V", upper: 200 },
    { label: "750 V", upper: 750 },
  ],
  dcCurrent: [
    { label: "200 µA", upper: 0.0002 },
    { label: "2 mA", upper: 0.002 },
    { label: "20 mA", upper: 0.02 },
    { label: "200 mA", upper: 0.2 },
    { label: "2 A", upper: 2 },
    { label: "10 A", upper: 10 },
  ],
  acCurrent: [
    { label: "200 µA", upper: 0.0002 },
    { label: "2 mA", upper: 0.002 },
    { label: "20 mA", upper: 0.02 },
    { label: "200 mA", upper: 0.2 },
    { label: "2 A", upper: 2 },
    { label: "10 A", upper: 10 },
  ],
  resistance: [
    { label: "200 Ω", upper: 200 },
    { label: "2 kΩ", upper: 2_000 },
    { label: "20 kΩ", upper: 20_000 },
    { label: "200 kΩ", upper: 200_000 },
    { label: "1 MΩ", upper: 1_000_000 },
    { label: "10 MΩ", upper: 10_000_000 },
    { label: "100 MΩ", upper: 100_000_000 },
  ],
  fourWireResistance: [
    { label: "200 Ω", upper: 200 },
    { label: "2 kΩ", upper: 2_000 },
    { label: "20 kΩ", upper: 20_000 },
    { label: "200 kΩ", upper: 200_000 },
    { label: "1 MΩ", upper: 1_000_000 },
    { label: "10 MΩ", upper: 10_000_000 },
    { label: "100 MΩ", upper: 100_000_000 },
  ],
  capacitance: [
    { label: "2 nF", upper: 2e-9 },
    { label: "20 nF", upper: 20e-9 },
    { label: "200 nF", upper: 200e-9 },
    { label: "2 µF", upper: 2e-6 },
    { label: "20 µF", upper: 20e-6 },
    { label: "200 µF", upper: 200e-6 },
    { label: "10 mF", upper: 10e-3 },
  ],
};

const RANGING: MultimeterRangingCapability = {
  modes: SUPPORTED_MODES,
  ranges: RANGES,
  nplc: [0.02, 0.2, 1, 10, 100],
  autoZero: true,
};

const TRIGGERING: MultimeterTriggerCapability = {
  sources: ["immediate", "external", "bus", "software"],
  slopes: ["positive", "negative"],
  sampleCountRange: { min: 1, max: 1_000_000 },
  delayRangeSec: { min: 0, max: 3600 },
};

const MATH: MultimeterMathCapability = {
  functions: ["none", "null", "db", "dbm", "stats", "limit"],
  allowedModes: {
    none: SUPPORTED_MODES,
    null: SUPPORTED_MODES,
    stats: SUPPORTED_MODES,
    limit: SUPPORTED_MODES,
    db: ["dcVoltage", "acVoltage"],
    dbm: ["dcVoltage", "acVoltage"],
  },
  dbmReferences: [50, 75, 93, 110, 124, 125, 135, 150, 250, 300, 500, 600, 800, 900, 1000, 1200, 8000],
};

const DUAL_DISPLAY: MultimeterDualDisplayCapability = {
  pairs: {
    dcVoltage: ["acVoltage", "frequency"],
    acVoltage: ["dcVoltage", "frequency"],
    dcCurrent: ["acCurrent", "frequency"],
    acCurrent: ["dcCurrent", "frequency"],
    resistance: ["continuity"],
    fourWireResistance: ["continuity"],
    frequency: ["period", "acVoltage"],
    period: ["frequency"],
    temperature: ["resistance"],
  },
};

const LOGGING: MultimeterLoggingCapability = {
  maxSamples: 1_000_000,
  minIntervalMs: 50,
};

const TEMPERATURE: MultimeterTemperatureCapability = {
  units: ["celsius", "fahrenheit", "kelvin"],
  transducers: [
    "pt100",
    "pt1000",
    "thermocouple-k",
    "thermocouple-j",
    "thermocouple-t",
    "thermocouple-e",
    "thermistor",
  ],
};

const PRESETS: InstrumentPresetCapability = { slots: 10 };

type DmmScpi = {
  readonly configure: string;
  readonly sense: string; // :SENSe:<fn>
  readonly queryPrefix: string; // matches "VOLT", "RES", etc.
};

const SCPI_MAP: Partial<Record<MultimeterMode, DmmScpi>> = {
  dcVoltage: { configure: ":CONFigure:VOLTage:DC AUTO", sense: ":SENSe:VOLTage:DC", queryPrefix: "VOLT" },
  acVoltage: { configure: ":CONFigure:VOLTage:AC AUTO", sense: ":SENSe:VOLTage:AC", queryPrefix: "VOLT:AC" },
  dcCurrent: { configure: ":CONFigure:CURRent:DC AUTO", sense: ":SENSe:CURRent:DC", queryPrefix: "CURR" },
  acCurrent: { configure: ":CONFigure:CURRent:AC AUTO", sense: ":SENSe:CURRent:AC", queryPrefix: "CURR:AC" },
  resistance: { configure: ":CONFigure:RESistance AUTO", sense: ":SENSe:RESistance", queryPrefix: "RES" },
  fourWireResistance: {
    configure: ":CONFigure:FRESistance AUTO",
    sense: ":SENSe:FRESistance",
    queryPrefix: "FRES",
  },
  frequency: { configure: ":CONFigure:FREQuency", sense: ":SENSe:FREQuency", queryPrefix: "FREQ" },
  period: { configure: ":CONFigure:PERiod", sense: ":SENSe:PERiod", queryPrefix: "PER" },
  capacitance: {
    configure: ":CONFigure:CAPacitance AUTO",
    sense: ":SENSe:CAPacitance",
    queryPrefix: "CAP",
  },
  continuity: { configure: ":CONFigure:CONTinuity", sense: ":SENSe:CONTinuity", queryPrefix: "CONT" },
  diode: { configure: ":CONFigure:DIODe", sense: ":SENSe:DIODe", queryPrefix: "DIOD" },
  temperature: {
    configure: ":CONFigure:TEMPerature",
    sense: ":SENSe:TEMPerature",
    queryPrefix: "TEMP",
  },
};

const TRANSDUCER_CODE: Record<TemperatureTransducer, string> = {
  pt100: "RTD,PT100",
  pt1000: "RTD,PT1000",
  "thermocouple-k": "TCouple,K",
  "thermocouple-j": "TCouple,J",
  "thermocouple-t": "TCouple,T",
  "thermocouple-e": "TCouple,E",
  thermistor: "THERmistor",
};

const TRANSDUCER_FROM_SCPI: Array<{ match: RegExp; value: TemperatureTransducer }> = [
  { match: /^RTD.*PT1000/i, value: "pt1000" },
  { match: /^RTD.*PT100/i, value: "pt100" },
  { match: /THERmistor/i, value: "thermistor" },
  { match: /TCouple.*K/i, value: "thermocouple-k" },
  { match: /TCouple.*J/i, value: "thermocouple-j" },
  { match: /TCouple.*T/i, value: "thermocouple-t" },
  { match: /TCouple.*E/i, value: "thermocouple-e" },
];

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

const MATH_FN_TO_SCPI: Record<MultimeterMathFunction, string> = {
  none: "NONE",
  null: "NULL",
  db: "DB",
  dbm: "DBM",
  stats: "AVERage",
  limit: "LIMit",
};

const SCPI_TO_MATH_FN: Record<string, MultimeterMathFunction> = {
  NONE: "none",
  NULL: "null",
  DB: "db",
  DBM: "dbm",
  AVER: "stats",
  AVERAGE: "stats",
  LIM: "limit",
  LIMIT: "limit",
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

/** Rigol DM858 / DM800-family bench DMM driver. */
export class RigolDm858 implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly supportedModes = SUPPORTED_MODES;
  readonly ranging = RANGING;
  readonly triggering = TRIGGERING;
  readonly math = MATH;
  readonly dualDisplay = DUAL_DISPLAY;
  readonly logging = LOGGING;
  readonly temperature = TEMPERATURE;
  readonly presets = PRESETS;

  #mathConfig: MultimeterMathConfig = { function: "none" };
  #run: LoggingRun | null = null;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
  ) {}

  async getMode(): Promise<MultimeterMode> {
    const raw = await this.port.query(":FUNCtion?");
    return parseMode(raw);
  }

  async setMode(mode: MultimeterMode): Promise<void> {
    const entry = SCPI_MAP[mode];
    if (!entry) throw new Error(`mode '${mode}' is not supported`);
    await this.port.write(entry.configure);
  }

  async read(): Promise<MultimeterReading> {
    const [raw, modeStr] = await Promise.all([
      this.port.query(":READ?", { timeoutMs: 10_000 }),
      this.port.query(":FUNCtion?"),
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

  // ---- 2.6a ----

  async getRange(): Promise<MultimeterRangeState> {
    const mode = await this.getMode();
    const entry = SCPI_MAP[mode];
    if (!entry) return { mode, upper: 0, auto: true };
    const [upperRaw, autoRaw] = await Promise.all([
      this.port.query(`${entry.sense}:RANGe?`),
      this.port.query(`${entry.sense}:RANGe:AUTO?`),
    ]);
    const upper = Number.parseFloat(upperRaw) || 0;
    const auto = parseBool(autoRaw);
    return { mode, upper, auto };
  }

  async setRange(mode: MultimeterMode, range: number | "auto"): Promise<void> {
    const entry = SCPI_MAP[mode];
    if (!entry) throw new Error(`mode '${mode}' is not supported`);
    if (range === "auto") {
      await this.port.write(`${entry.sense}:RANGe:AUTO ON`);
      return;
    }
    if (!Number.isFinite(range) || range <= 0) {
      throw new Error(`invalid range ${range}`);
    }
    await this.port.write(`${entry.sense}:RANGe:AUTO OFF`);
    await this.port.write(`${entry.sense}:RANGe ${range}`);
  }

  async getNplc(): Promise<number> {
    const mode = await this.getMode();
    const entry = SCPI_MAP[mode];
    if (!entry) return 1;
    const raw = await this.port.query(`${entry.sense}:NPLC?`);
    return Number.parseFloat(raw) || 0;
  }

  async setNplc(value: number): Promise<void> {
    const mode = await this.getMode();
    const entry = SCPI_MAP[mode];
    if (!entry) throw new Error(`mode '${mode}' has no NPLC setting`);
    await this.port.write(`${entry.sense}:NPLC ${value}`);
  }

  async setAutoZero(mode: MultimeterAutoZero): Promise<void> {
    const current = await this.getMode();
    const entry = SCPI_MAP[current];
    if (!entry) return;
    switch (mode) {
      case "on":
        await this.port.write(`${entry.sense}:ZERO:AUTO ON`);
        break;
      case "off":
        await this.port.write(`${entry.sense}:ZERO:AUTO OFF`);
        break;
      case "once":
        await this.port.write(`${entry.sense}:ZERO:AUTO ONCE`);
        break;
    }
  }

  async getTriggerConfig(): Promise<MultimeterTriggerConfig> {
    const [sourceRaw, slopeRaw, delayRaw, countRaw] = await Promise.all([
      this.port.query(":TRIGger:SOURce?"),
      this.port.query(":TRIGger:SLOPe?"),
      this.port.query(":TRIGger:DELay?"),
      this.port.query(":SAMPle:COUNt?"),
    ]);
    return {
      source: parseTriggerSource(sourceRaw),
      slope: parseTriggerSlope(slopeRaw),
      delaySec: Number.parseFloat(delayRaw) || 0,
      sampleCount: Math.max(1, Math.round(Number.parseFloat(countRaw) || 1)),
    };
  }

  async setTriggerConfig(config: MultimeterTriggerConfig): Promise<void> {
    await this.port.write(`:TRIGger:SOURce ${encodeTriggerSource(config.source)}`);
    await this.port.write(`:TRIGger:SLOPe ${encodeTriggerSlope(config.slope)}`);
    await this.port.write(`:TRIGger:DELay ${config.delaySec}`);
    await this.port.write(`:SAMPle:COUNt ${Math.max(1, Math.round(config.sampleCount))}`);
  }

  async trigger(): Promise<void> {
    await this.port.write("*TRG");
  }

  // ---- 2.6b ----

  async getMath(): Promise<MultimeterMathState> {
    const [stateRaw, fnRaw] = await Promise.all([
      this.port.query(":CALCulate:STATe?"),
      this.port.query(":CALCulate:FUNCtion?"),
    ]);
    const enabled = parseBool(stateRaw);
    const fn = parseMathFunction(fnRaw);
    if (!enabled || fn === "none") {
      return { config: { function: "none" } };
    }
    const config: MultimeterMathConfig = { ...this.#mathConfig, function: fn };
    const state: MultimeterMathState = { config };
    if (fn === "stats") {
      const [min, max, avg, sd, count] = await Promise.all([
        this.port.query(":CALCulate:AVERage:MINimum?"),
        this.port.query(":CALCulate:AVERage:MAXimum?"),
        this.port.query(":CALCulate:AVERage:AVERage?"),
        this.port.query(":CALCulate:AVERage:SDEViation?"),
        this.port.query(":CALCulate:AVERage:COUNt?"),
      ]);
      return {
        ...state,
        stats: {
          min: num(min),
          max: num(max),
          average: num(avg),
          stddev: num(sd),
          count: Math.max(0, Math.round(num(count))),
        },
      };
    }
    if (fn === "limit") {
      const [upper, lower] = await Promise.all([
        this.port.query(":CALCulate:LIMit:UPPer?"),
        this.port.query(":CALCulate:LIMit:LOWer?"),
      ]);
      const reading = await this.read();
      const v = reading.value;
      let result: "pass" | "fail-high" | "fail-low" = "pass";
      if (v > num(upper)) result = "fail-high";
      else if (v < num(lower)) result = "fail-low";
      return {
        config: { ...config, limitUpper: num(upper), limitLower: num(lower) },
        limitResult: result,
      };
    }
    if (fn === "null") {
      const offset = await this.port.query(":CALCulate:NULL:OFFSet?");
      return { config: { ...config, nullOffset: num(offset) } };
    }
    if (fn === "dbm") {
      const ref = await this.port.query(":CALCulate:DBM:REFerence?");
      return { config: { ...config, dbmReference: num(ref) } };
    }
    return state;
  }

  async setMath(config: MultimeterMathConfig): Promise<void> {
    this.#mathConfig = config;
    if (config.function === "none") {
      await this.port.write(":CALCulate:STATe OFF");
      return;
    }
    await this.port.write(`:CALCulate:FUNCtion ${MATH_FN_TO_SCPI[config.function]}`);
    await this.port.write(":CALCulate:STATe ON");
    if (config.function === "null" && config.nullOffset !== undefined) {
      await this.port.write(`:CALCulate:NULL:OFFSet ${config.nullOffset}`);
    }
    if (config.function === "dbm" && config.dbmReference !== undefined) {
      await this.port.write(`:CALCulate:DBM:REFerence ${config.dbmReference}`);
    }
    if (config.function === "limit") {
      if (config.limitUpper !== undefined) {
        await this.port.write(`:CALCulate:LIMit:UPPer ${config.limitUpper}`);
      }
      if (config.limitLower !== undefined) {
        await this.port.write(`:CALCulate:LIMit:LOWer ${config.limitLower}`);
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
    try {
      const raw = await this.port.query(":DISPlay:WINDow2:FUNCtion?");
      const mode = parseMode(raw);
      return mode;
    } catch {
      return null;
    }
  }

  async setDualDisplay(secondary: MultimeterMode | null): Promise<void> {
    if (secondary === null) {
      await this.port.write(":DISPlay:WINDow2:STATe OFF");
      return;
    }
    const entry = SCPI_MAP[secondary];
    if (!entry) throw new Error(`mode '${secondary}' not supported for dual display`);
    await this.port.write(`:DISPlay:WINDow2:FUNCtion ${entry.queryPrefix}`);
    await this.port.write(":DISPlay:WINDow2:STATe ON");
  }

  async readDual(): Promise<MultimeterDualReading> {
    const [primary, secondaryRaw] = await Promise.all([
      this.read(),
      this.port.query(":READ:SECondary?").catch(() => ""),
    ]);
    const secondaryModeRaw = await this.port
      .query(":DISPlay:WINDow2:FUNCtion?")
      .catch(() => "");
    const secondaryMode = parseMode(secondaryModeRaw);
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

  // ---- 2.6c ----

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
    const [unitRaw, transRaw] = await Promise.all([
      this.port.query(":UNIT:TEMPerature?"),
      this.port.query(":SENSe:TEMPerature:TRANsducer:TYPE?").catch(() => "RTD,PT100"),
    ]);
    const unit = UNIT_FROM_SCPI[unitRaw.trim().toUpperCase()] ?? "celsius";
    const transducer =
      TRANSDUCER_FROM_SCPI.find((entry) => entry.match.test(transRaw))?.value ?? "pt100";
    return { unit, transducer };
  }

  async setTemperatureConfig(config: MultimeterTemperatureConfig): Promise<void> {
    await this.port.write(`:UNIT:TEMPerature ${UNIT_MAP[config.unit]}`);
    await this.port.write(
      `:SENSe:TEMPerature:TRANsducer:TYPE ${TRANSDUCER_CODE[config.transducer]}`,
    );
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    // DM858 doesn't expose a slot-catalog query, so we return a conservative
    // list where we treat every slot as potentially occupied. Drivers that do
    // support a catalog (PSU) override this.
    return Array.from({ length: PRESETS.slots }, () => true);
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
    if (!Number.isInteger(slot) || slot < 0 || slot >= PRESETS.slots) {
      throw new RangeError(`preset slot must be 0..${PRESETS.slots - 1}`);
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
      // Keep the in-memory buffer bounded.
      if (run.samples.length > LOGGING.maxSamples) {
        run.samples.splice(0, run.samples.length - LOGGING.maxSamples);
      }
    } catch {
      // Polling errors do not terminate the run; UI can surface them via
      // /logging status polling when needed.
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

function parseBool(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE" || v === "YES";
}

function num(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseTriggerSource(raw: string): MultimeterTriggerSource {
  const v = raw.trim().toUpperCase();
  if (v.startsWith("EXT")) return "external";
  if (v.startsWith("BUS")) return "bus";
  if (v.startsWith("SOFT") || v.startsWith("MAN")) return "software";
  return "immediate";
}

function encodeTriggerSource(source: MultimeterTriggerSource): string {
  switch (source) {
    case "external":
      return "EXTernal";
    case "bus":
      return "BUS";
    case "software":
      return "BUS"; // DM858 uses BUS for software/*TRG triggering
    default:
      return "IMMediate";
  }
}

function parseTriggerSlope(raw: string): MultimeterTriggerSlope {
  return raw.trim().toUpperCase().startsWith("NEG") ? "negative" : "positive";
}

function encodeTriggerSlope(slope: MultimeterTriggerSlope): string {
  return slope === "negative" ? "NEGative" : "POSitive";
}

function parseMathFunction(raw: string): MultimeterMathFunction {
  const v = raw.trim().replace(/^"|"$/g, "").toUpperCase();
  return SCPI_TO_MATH_FN[v] ?? "none";
}
