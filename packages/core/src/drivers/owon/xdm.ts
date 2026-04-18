import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type InstrumentPresetCapability,
  type MultimeterAutoZero,
  type MultimeterMode,
  type MultimeterRangeState,
  type MultimeterRangingCapability,
  type MultimeterReading,
} from "../../facades/multimeter.js";
import { parseBool, parseReading, unquote } from "./_shared/index.js";
import { type XdmProfile, XDM_DEFAULT } from "./xdm-profile.js";

/**
 * Owon XDM DMM driver (XDM1041 / XDM1241 / XDM2041).
 *
 * XDM firmware follows the `CONFigure:<fn>` / `READ?` / `SENSe:<fn>:`
 * pattern; most commands line up with Keysight Truevolt / Siglent SDM.
 * Differences surface at the **capability** layer (no math / logging /
 * dual display / temperature on the LXI-advertised SKUs), which the
 * driver reflects by *not* advertising those facets on `IMultimeter`.
 *
 * The driver implements the minimum required surface — mode, read,
 * range, NPLC, auto-zero — plus optional `savePreset` / `recallPreset`
 * when the profile carries `presetSlots > 0`. Anything further (math,
 * dual, logging, trigger subsystem, temperature) is deliberately
 * absent; the UI correctly hides those tabs because the facade fields
 * are undefined.
 */

type XdmScpi = {
  readonly configure: string;
  readonly sense: string;
};

const SCPI_MAP: Partial<Record<MultimeterMode, XdmScpi>> = {
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
};

export class OwonXdm implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly profile: XdmProfile;
  readonly supportedModes: readonly MultimeterMode[];
  readonly ranging: MultimeterRangingCapability;
  readonly presets?: InstrumentPresetCapability;

  #currentMode: MultimeterMode = "dcVoltage";

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: XdmProfile = XDM_DEFAULT,
  ) {
    this.profile = profile;
    this.supportedModes = profile.modes;
    this.ranging = {
      modes: profile.modes,
      ranges: profile.ranges,
      nplc: profile.nplcOptions,
      autoZero: profile.displayDigits >= 5,
    };
    if (profile.presetSlots > 0) {
      this.presets = { slots: profile.presetSlots };
    }
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
    const parsed = parseReading(raw);
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
    const scpi = SCPI_MAP[this.#currentMode];
    if (!scpi || !supportsNplc(this.#currentMode)) return 1;
    try {
      const raw = await this.port.query(`${scpi.sense}:NPLCycles?`);
      return Number.parseFloat(raw) || 1;
    } catch {
      return 1;
    }
  }

  async setNplc(value: number): Promise<void> {
    const scpi = SCPI_MAP[this.#currentMode];
    if (!scpi || !supportsNplc(this.#currentMode)) return;
    await this.port.write(`${scpi.sense}:NPLCycles ${value}`);
  }

  async setAutoZero(mode: MultimeterAutoZero): Promise<void> {
    // Only 5½-digit XDM2041 supports auto-zero via SCPI. The 4½-digit
    // siblings silently ignore the command; we forward it anyway so
    // the UI stays consistent with other DMMs.
    const scpi = SCPI_MAP[this.#currentMode];
    if (!scpi) return;
    const cmd = mode === "once" ? "ONCE" : mode.toUpperCase();
    try {
      await this.port.write(`${scpi.sense}:ZERO:AUTO ${cmd}`);
    } catch {
      /* ignore — firmware may reject */
    }
  }

  async getPresetCatalog(): Promise<readonly boolean[]> {
    const slots = this.presets?.slots ?? 0;
    return Array.from({ length: slots }, () => false);
  }

  async savePreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*SAV ${slot}`);
  }

  async recallPreset(slot: number): Promise<void> {
    this.#assertSlot(slot);
    await this.port.write(`*RCL ${slot}`);
  }

  #requireScpi(mode: MultimeterMode): XdmScpi {
    const scpi = SCPI_MAP[mode];
    if (!scpi) {
      throw new Error(`Owon XDM driver does not implement mode ${mode}`);
    }
    return scpi;
  }

  #assertSlot(slot: number): void {
    const max = this.presets?.slots ?? 0;
    if (max === 0) {
      throw new Error(`Owon ${this.profile.variant} does not support presets`);
    }
    if (!Number.isInteger(slot) || slot < 0 || slot >= max) {
      throw new RangeError(
        `preset slot must be an integer between 0 and ${max - 1}`,
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
  return fallback;
}
