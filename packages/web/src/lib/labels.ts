import type {
  DeviceKind,
  ElectronicLoadMode,
  MultimeterMode,
  SignalGeneratorWaveformType,
} from "@lxi-web/core/browser";

export function kindLabel(kind: DeviceKind): string {
  switch (kind) {
    case "oscilloscope":
      return "Oscilloscope";
    case "powerSupply":
      return "Power supply";
    case "multimeter":
      return "Multimeter";
    case "electronicLoad":
      return "Electronic load";
    case "signalGenerator":
      return "Signal generator";
    case "spectrumAnalyzer":
      return "Spectrum analyzer";
    default:
      return "Unidentified";
  }
}

const SG_WAVEFORM_LABELS: Readonly<
  Record<SignalGeneratorWaveformType, string>
> = {
  sine: "Sine",
  square: "Square",
  ramp: "Ramp",
  pulse: "Pulse",
  noise: "Noise",
  dc: "DC",
  arbitrary: "Arbitrary",
};

export function signalGeneratorWaveformLabel(
  type: SignalGeneratorWaveformType,
): string {
  return SG_WAVEFORM_LABELS[type];
}

const ELOAD_MODE_LABELS: Readonly<Record<ElectronicLoadMode, string>> = {
  cc: "Constant Current",
  cv: "Constant Voltage",
  cr: "Constant Resistance",
  cp: "Constant Power",
};

export function electronicLoadModeLabel(mode: ElectronicLoadMode): string {
  return ELOAD_MODE_LABELS[mode];
}

const ELOAD_MODE_UNIT: Readonly<Record<ElectronicLoadMode, string>> = {
  cc: "A",
  cv: "V",
  cr: "Ω",
  cp: "W",
};

export function electronicLoadModeUnit(mode: ElectronicLoadMode): string {
  return ELOAD_MODE_UNIT[mode];
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
