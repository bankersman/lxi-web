import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IOscilloscope,
  OscilloscopeChannelState,
  OscilloscopeCoupling,
  TimebaseState,
  Waveform,
} from "../../facades/oscilloscope.js";

const CHANNEL_IDS = [1, 2, 3, 4] as const;
const ONE_OF_COUPLINGS: Record<string, OscilloscopeCoupling> = {
  DC: "dc",
  AC: "ac",
  GND: "gnd",
};
const REV_COUPLINGS: Record<OscilloscopeCoupling, string> = {
  dc: "DC",
  ac: "AC",
  gnd: "GND",
};

/**
 * Driver for the Rigol DHO800 family (DHO804 tested). Uses byte-mode waveform
 * transfer and decodes samples with the preamble's X/Y scale + origin.
 */
export class RigolDho800 implements IOscilloscope {
  readonly kind = "oscilloscope" as const;

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
  ) {}

  async getChannels(): Promise<OscilloscopeChannelState[]> {
    const states = await Promise.all(
      CHANNEL_IDS.map(async (id) => this.#readChannel(id)),
    );
    return states;
  }

  async setChannelEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.port.write(`:CHANnel${channel}:DISPlay ${enabled ? "ON" : "OFF"}`);
  }

  async getTimebase(): Promise<TimebaseState> {
    const [scale, position] = await Promise.all([
      this.port.query(":TIMebase:MAIN:SCALe?"),
      this.port.query(":TIMebase:MAIN:OFFSet?"),
    ]);
    return { scale: Number.parseFloat(scale), position: Number.parseFloat(position) };
  }

  async setTimebase(settings: Partial<TimebaseState>): Promise<void> {
    if (settings.scale !== undefined) {
      await this.port.write(`:TIMebase:MAIN:SCALe ${settings.scale}`);
    }
    if (settings.position !== undefined) {
      await this.port.write(`:TIMebase:MAIN:OFFSet ${settings.position}`);
    }
  }

  async singleCapture(): Promise<void> {
    await this.port.write(":SINGle");
    // Give the instrument a beat to arm; downstream callers still need to
    // poll :TRIGger:STATus? before reading in order to get a fresh frame.
  }

  async readWaveform(channel: number): Promise<Waveform> {
    await this.port.write(`:WAVeform:SOURce CHANnel${channel}`);
    await this.port.write(":WAVeform:MODE NORMal");
    await this.port.write(":WAVeform:FORMat BYTE");
    const preambleRaw = await this.port.query(":WAVeform:PREamble?");
    const preamble = parsePreamble(preambleRaw);
    const raw = await this.port.queryBinary(":WAVeform:DATA?", {
      timeoutMs: 15_000,
    });
    const y = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const byte = raw[i] ?? 0;
      y[i] = (byte - preamble.yOrigin - preamble.yReference) * preamble.yIncrement;
    }
    const x = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      x[i] = preamble.xOrigin + i * preamble.xIncrement;
    }
    return {
      channel,
      x,
      y,
      xIncrement: preamble.xIncrement,
      xOrigin: preamble.xOrigin,
      capturedAt: Date.now(),
    };
  }

  async #readChannel(id: number): Promise<OscilloscopeChannelState> {
    const [display, scale, offset, coupling, probe] = await Promise.all([
      this.port.query(`:CHANnel${id}:DISPlay?`),
      this.port.query(`:CHANnel${id}:SCALe?`),
      this.port.query(`:CHANnel${id}:OFFSet?`),
      this.port.query(`:CHANnel${id}:COUPling?`),
      this.port.query(`:CHANnel${id}:PROBe?`),
    ]);
    return {
      id,
      label: `CH${id}`,
      enabled: parseBool(display),
      scale: Number.parseFloat(scale),
      offset: Number.parseFloat(offset),
      coupling: ONE_OF_COUPLINGS[coupling.trim().toUpperCase()] ?? "dc",
      probeAttenuation: Number.parseFloat(probe),
    };
  }
}

export function encodeCoupling(coupling: OscilloscopeCoupling): string {
  return REV_COUPLINGS[coupling];
}

function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v === "1" || v === "ON" || v === "TRUE";
}

interface Preamble {
  readonly points: number;
  readonly xIncrement: number;
  readonly xOrigin: number;
  readonly xReference: number;
  readonly yIncrement: number;
  readonly yOrigin: number;
  readonly yReference: number;
}

/**
 * Rigol WAV:PREamble? returns 10 comma-separated fields:
 * format,type,points,count,xincrement,xorigin,xreference,yincrement,yorigin,yreference
 */
export function parsePreamble(raw: string): Preamble {
  const fields = raw.trim().split(",").map((s) => s.trim());
  const num = (idx: number): number => {
    const v = fields[idx];
    const n = v !== undefined ? Number.parseFloat(v) : Number.NaN;
    return Number.isFinite(n) ? n : 0;
  };
  return {
    points: Math.max(0, Math.round(num(2))),
    xIncrement: num(4),
    xOrigin: num(5),
    xReference: num(6),
    yIncrement: num(7),
    yOrigin: num(8),
    yReference: num(9),
  };
}
