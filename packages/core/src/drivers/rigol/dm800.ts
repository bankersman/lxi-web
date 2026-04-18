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
import { type Dm800Profile, DM800_DEFAULT } from "./dm800-profile.js";
import { parseBool } from "./_shared/index.js";

const TRIGGERING: MultimeterTriggerCapability = {
  sources: ["immediate", "external", "bus", "software"],
  slopes: ["positive", "negative"],
  sampleCountRange: { min: 1, max: 1_000_000 },
  delayRangeSec: { min: 0, max: 3600 },
};

const LOGGING: MultimeterLoggingCapability = {
  maxSamples: 1_000_000,
  minIntervalMs: 50,
};

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

/**
 * DM858 uses a two-step transducer setter: first select the family via
 * `:SENS:TEMP:TRAN:TYPE {RTD|TCouple|THERmistor}`, then the sub-type via
 * the family-scoped command (e.g. `:SENS:TEMP:TRAN:RTD:TYPE PT100`).
 * Joining them with a comma (as we used to) is silently rejected, which is
 * why setting thermocouple K wasn't honored on the device.
 */
const TRANSDUCER_FAMILY: Record<TemperatureTransducer, string> = {
  pt100: "RTD",
  pt1000: "RTD",
  "thermocouple-k": "TCouple",
  "thermocouple-j": "TCouple",
  "thermocouple-t": "TCouple",
  "thermocouple-e": "TCouple",
  thermistor: "THERmistor",
};

const TRANSDUCER_SUBTYPE: Partial<Record<TemperatureTransducer, string>> = {
  pt100: "PT100",
  pt1000: "PT1000",
  "thermocouple-k": "K",
  "thermocouple-j": "J",
  "thermocouple-t": "T",
  "thermocouple-e": "E",
};

const OPTIONAL_TIMEOUT_MS = 800;

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
      autoZero: true,
    };
    // db/dbm are only valid on AC/DC voltage; every other function gets the
    // full mode list the profile advertises.
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

  /**
   * Query a command that some DM858 firmware revisions silently drop (the
   * device never replies, the session times out). Uses a short timeout and
   * falls back to the caller-supplied default so one unsupported node
   * doesn't stall the whole capability sweep.
   */
  async #queryOpt(command: string, fallback: string): Promise<string> {
    try {
      return await this.port.query(command, { timeoutMs: OPTIONAL_TIMEOUT_MS });
    } catch {
      return fallback;
    }
  }

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
    // Some modes (frequency, continuity, capacitance) don't expose a RANGe?
    // node on this firmware — fast-fail and treat as auto.
    const [upperRaw, autoRaw] = await Promise.all([
      this.#queryOpt(`${entry.sense}:RANGe?`, "0"),
      this.#queryOpt(`${entry.sense}:RANGe:AUTO?`, "1"),
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
    // Continuity / diode / frequency don't expose NPLC; fast-fail.
    const raw = await this.#queryOpt(`${entry.sense}:NPLC?`, "1");
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
    // :TRIGger:SLOPe? and :TRIGger:DELay? never reply on this firmware
    // (confirmed via runtime logs); fast-fail and use sane defaults rather
    // than blocking the queue for 5 s per query.
    const [sourceRaw, slopeRaw, delayRaw, countRaw] = await Promise.all([
      this.#queryOpt(":TRIGger:SOURce?", "IMM"),
      this.#queryOpt(":TRIGger:SLOPe?", "POS"),
      this.#queryOpt(":TRIGger:DELay?", "0"),
      this.#queryOpt(":SAMPle:COUNt?", "1"),
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
    // :CALCulate:STATe? / :FUNCtion? never reply on this firmware — we
    // can't know the device-side state, so optimistically treat it as
    // disabled and let the UI drive it via setMath.
    const [stateRaw, fnRaw] = await Promise.all([
      this.#queryOpt(":CALCulate:STATe?", "0"),
      this.#queryOpt(":CALCulate:FUNCtion?", "NONE"),
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
    // :DISPlay:WINDow2:FUNCtion? never replies on this firmware unless
    // a secondary is actively configured; short-timeout instead of the
    // 5 s default.
    const raw = await this.#queryOpt(":DISPlay:WINDow2:FUNCtion?", "");
    if (!raw) return null;
    return parseMode(raw);
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
      this.#queryOpt(":READ:SECondary?", ""),
    ]);
    const secondaryModeRaw = await this.#queryOpt(
      ":DISPlay:WINDow2:FUNCtion?",
      "",
    );
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
      this.#queryOpt(":SENSe:TEMPerature:TRANsducer:TYPE?", "RTD"),
    ]);
    const unit = UNIT_FROM_SCPI[unitRaw.trim().toUpperCase()] ?? "celsius";
    const transducer =
      TRANSDUCER_FROM_SCPI.find((entry) => entry.match.test(transRaw))?.value ?? "pt100";
    return { unit, transducer };
  }

  async setTemperatureConfig(config: MultimeterTemperatureConfig): Promise<void> {
    await this.port.write(`:UNIT:TEMPerature ${UNIT_MAP[config.unit]}`);
    const family = TRANSDUCER_FAMILY[config.transducer];
    const subtype = TRANSDUCER_SUBTYPE[config.transducer];
    await this.port.write(`:SENSe:TEMPerature:TRANsducer:TYPE ${family}`);
    if (subtype) {
      // DM858 sub-type setter: e.g. :SENS:TEMP:TRAN:RTD:TYPE PT100
      //                       or :SENS:TEMP:TRAN:TCouple:TYPE K
      await this.port.write(
        `:SENSe:TEMPerature:TRANsducer:${family}:TYPE ${subtype}`,
      );
    }
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    // DM858 doesn't expose a slot-catalog query, so we return a conservative
    // list where we treat every slot as potentially occupied. Drivers that do
    // support a catalog (PSU) override this.
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
