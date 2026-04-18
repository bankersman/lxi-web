import type { InstrumentFacade } from "./base.js";

export type OscilloscopeCoupling = "dc" | "ac" | "gnd";

export interface OscilloscopeChannelState {
  readonly id: number;
  readonly label: string;
  readonly enabled: boolean;
  /** Volts per division. */
  readonly scale: number;
  /** Vertical offset in volts. */
  readonly offset: number;
  readonly coupling: OscilloscopeCoupling;
  readonly probeAttenuation: number;
}

export interface TimebaseState {
  /** Seconds per division. */
  readonly scale: number;
  /** Horizontal position (seconds, relative to trigger). */
  readonly position: number;
}

export interface Waveform {
  readonly channel: number;
  /** Time axis in seconds. */
  readonly x: Float64Array;
  /** Voltage axis in volts. */
  readonly y: Float64Array;
  /** Convenience — time per point. */
  readonly xIncrement: number;
  /** Convenience — time of the first sample. */
  readonly xOrigin: number;
  readonly capturedAt: number;
}

export interface IOscilloscope extends InstrumentFacade {
  readonly kind: "oscilloscope";
  getChannels(): Promise<OscilloscopeChannelState[]>;
  setChannelEnabled(channel: number, enabled: boolean): Promise<void>;
  getTimebase(): Promise<TimebaseState>;
  setTimebase(settings: Partial<TimebaseState>): Promise<void>;
  /** Trigger one acquisition and return once the instrument is ready. */
  singleCapture(): Promise<void>;
  readWaveform(channel: number): Promise<Waveform>;
}
