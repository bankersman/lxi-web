import type { DeviceKind, MultimeterMode } from "@lxi-web/core/browser";

export function kindLabel(kind: DeviceKind): string {
  switch (kind) {
    case "oscilloscope":
      return "Oscilloscope";
    case "powerSupply":
      return "Power supply";
    case "multimeter":
      return "Multimeter";
    default:
      return "Unidentified";
  }
}

const MODE_LABELS: Readonly<Record<MultimeterMode, string>> = {
  dcVoltage: "DC Voltage",
  acVoltage: "AC Voltage",
  dcCurrent: "DC Current",
  acCurrent: "AC Current",
  resistance: "Resistance",
  fourWireResistance: "4-wire Ω",
  frequency: "Frequency",
  period: "Period",
  capacitance: "Capacitance",
  continuity: "Continuity",
  diode: "Diode",
  temperature: "Temperature",
};

export function multimeterModeLabel(mode: MultimeterMode): string {
  return MODE_LABELS[mode];
}
