import type { InstrumentFacade } from "./base.js";

export interface PsuChannelLimits {
  readonly voltageMax: number;
  readonly currentMax: number;
}

export interface PsuChannelState {
  readonly id: number;
  readonly label: string;
  readonly setVoltage: number;
  readonly setCurrent: number;
  readonly measuredVoltage: number;
  readonly measuredCurrent: number;
  readonly output: boolean;
  readonly limits: PsuChannelLimits;
}

export interface PsuMeasurement {
  readonly channel: number;
  readonly voltage: number;
  readonly current: number;
  readonly power: number;
  readonly measuredAt: number;
}

export interface IPowerSupply extends InstrumentFacade {
  readonly kind: "powerSupply";
  getChannels(): Promise<PsuChannelState[]>;
  setChannelOutput(channel: number, enabled: boolean): Promise<void>;
  setChannelVoltage(channel: number, volts: number): Promise<void>;
  setChannelCurrent(channel: number, amps: number): Promise<void>;
  measureChannel(channel: number): Promise<PsuMeasurement>;
}
