import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import {
  DEFAULT_MULTIMETER_UNITS,
  type IMultimeter,
  type MultimeterMode,
  type MultimeterReading,
} from "../../facades/multimeter.js";

/** Rigol DM858 / DM800-family bench DMM driver. */
export class RigolDm858 implements IMultimeter {
  readonly kind = "multimeter" as const;
  readonly supportedModes: readonly MultimeterMode[] = [
    "dcVoltage",
    "acVoltage",
    "dcCurrent",
    "acCurrent",
    "resistance",
    "frequency",
    "capacitance",
    "continuity",
    "diode",
  ];

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
  ) {}

  async getMode(): Promise<MultimeterMode> {
    const raw = await this.port.query(":FUNCtion?");
    return parseMode(raw);
  }

  async setMode(mode: MultimeterMode): Promise<void> {
    await this.port.write(CONFIG_COMMANDS[mode]);
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
}

const CONFIG_COMMANDS: Readonly<Record<MultimeterMode, string>> = {
  dcVoltage: ":CONFigure:VOLTage:DC AUTO",
  acVoltage: ":CONFigure:VOLTage:AC AUTO",
  dcCurrent: ":CONFigure:CURRent:DC AUTO",
  acCurrent: ":CONFigure:CURRent:AC AUTO",
  resistance: ":CONFigure:RESistance AUTO",
  frequency: ":CONFigure:FREQuency",
  capacitance: ":CONFigure:CAPacitance AUTO",
  continuity: ":CONFigure:CONTinuity",
  diode: ":CONFigure:DIODe",
};

const MODE_ALIASES: ReadonlyArray<{ readonly match: RegExp; readonly mode: MultimeterMode }> = [
  { match: /^"?VOLT(:DC)?"?$/i, mode: "dcVoltage" },
  { match: /^"?VOLT:AC"?$/i, mode: "acVoltage" },
  { match: /^"?CURR(:DC)?"?$/i, mode: "dcCurrent" },
  { match: /^"?CURR:AC"?$/i, mode: "acCurrent" },
  { match: /^"?RES"?$/i, mode: "resistance" },
  { match: /^"?FREQ"?$/i, mode: "frequency" },
  { match: /^"?CAP"?$/i, mode: "capacitance" },
  { match: /^"?CONT"?$/i, mode: "continuity" },
  { match: /^"?DIOD(E)?"?$/i, mode: "diode" },
];

export function parseMode(raw: string): MultimeterMode {
  const trimmed = raw.trim();
  for (const alias of MODE_ALIASES) {
    if (alias.match.test(trimmed)) return alias.mode;
  }
  return "dcVoltage";
}
