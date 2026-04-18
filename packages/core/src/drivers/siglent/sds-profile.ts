import type { ScpiPort } from "../../scpi/port.js";
import type {
  OscilloscopeDecoderProtocol,
} from "../../facades/oscilloscope.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant-specific capability profile for the Siglent SDS scope family.
 * Channel count, bandwidth, memory depth, sample rate, bit depth, and
 * decoder protocol set all vary; SCPI dialect is shared across the
 * SDS800X-HD / SDS2000X-HD(+Plus) / SDS3000X-HD / SDS6000A line
 * (SCPI-2000 "CHANnel1:" + "WAVeform:" tree).
 *
 * SDS1000X-E uses the older "C1:VDIV" / "WFSU" command set. The 4.6
 * `SiglentSdsHd` driver targets the modern tree; SDS1000X-E registers
 * against it as a best effort (newer X-E firmwares accept the modern
 * tree alongside the legacy one) and a full legacy driver lands with
 * the first community hardware report that needs it.
 */
export interface SdsProfile {
  readonly variant: string;
  readonly channels: number;
  readonly bandwidthMhz: number;
  readonly maxSampleRateGsPs: number;
  readonly bitDepth: number;
  readonly memoryDepths: readonly number[];
  readonly bandwidthLimits: readonly ("off" | "20M" | "100M" | "200M")[];
  readonly decoderBuses: number;
  readonly decoderProtocols: readonly OscilloscopeDecoderProtocol[];
  readonly referenceSlots: number;
  readonly presetSlots: number;
  readonly dialect: "legacy-1000xe" | "hd-scpi2000";
}

const HD_DECODERS: readonly OscilloscopeDecoderProtocol[] = ["i2c", "spi", "uart", "can", "lin"];

export const SDS_VARIANTS: readonly SdsProfile[] = [
  {
    variant: "SDS1104X-E",
    channels: 4,
    bandwidthMhz: 100,
    maxSampleRateGsPs: 1,
    bitDepth: 8,
    memoryDepths: [14e3, 140e3, 1.4e6, 14e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 2,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "legacy-1000xe",
  },
  {
    variant: "SDS1204X-E",
    channels: 4,
    bandwidthMhz: 200,
    maxSampleRateGsPs: 1,
    bitDepth: 8,
    memoryDepths: [14e3, 140e3, 1.4e6, 14e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 2,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "legacy-1000xe",
  },
  {
    variant: "SDS814X-HD",
    channels: 4,
    bandwidthMhz: 100,
    maxSampleRateGsPs: 2,
    bitDepth: 12,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 50e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 2,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
  {
    variant: "SDS824X-HD",
    channels: 4,
    bandwidthMhz: 200,
    maxSampleRateGsPs: 2,
    bitDepth: 12,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 50e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 2,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
  {
    variant: "SDS2104X-Plus",
    channels: 4,
    bandwidthMhz: 100,
    maxSampleRateGsPs: 2,
    bitDepth: 8,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 100e6, 200e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 4,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
  {
    variant: "SDS2354X-HD",
    channels: 4,
    bandwidthMhz: 350,
    maxSampleRateGsPs: 2,
    bitDepth: 12,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 100e6, 200e6],
    bandwidthLimits: ["off", "20M", "200M"],
    decoderBuses: 4,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
  {
    variant: "SDS3054X-HD",
    channels: 4,
    bandwidthMhz: 500,
    maxSampleRateGsPs: 4,
    bitDepth: 12,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 100e6, 500e6],
    bandwidthLimits: ["off", "20M", "200M"],
    decoderBuses: 4,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
  {
    variant: "SDS6104A",
    channels: 4,
    bandwidthMhz: 1000,
    maxSampleRateGsPs: 5,
    bitDepth: 8,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 100e6, 500e6],
    bandwidthLimits: ["off", "20M", "200M"],
    decoderBuses: 4,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
  {
    variant: "SDS6204A",
    channels: 4,
    bandwidthMhz: 2000,
    maxSampleRateGsPs: 5,
    bitDepth: 8,
    memoryDepths: [10e3, 100e3, 1e6, 10e6, 100e6, 500e6],
    bandwidthLimits: ["off", "20M", "200M"],
    decoderBuses: 4,
    decoderProtocols: HD_DECODERS,
    referenceSlots: 4,
    presetSlots: 10,
    dialect: "hd-scpi2000",
  },
];

/** Conservative catch-all matches a mid-range SDS2000X-Plus. */
export const SDS_DEFAULT: SdsProfile = {
  variant: "SDSxxxx",
  channels: 4,
  bandwidthMhz: 200,
  maxSampleRateGsPs: 2,
  bitDepth: 8,
  memoryDepths: [10e3, 100e3, 1e6, 10e6, 100e6],
  bandwidthLimits: ["off", "20M"],
  decoderBuses: 2,
  decoderProtocols: HD_DECODERS,
  referenceSlots: 4,
  presetSlots: 10,
  dialect: "hd-scpi2000",
};

/**
 * SDS refinement. `*OPT?` surfaces bandwidth-unlock licenses ("BW-200",
 * "SDS-AWG"), decoder licenses ("SDS-I2C", "SDS-CAN"), and MSO upgrades.
 * For 4.6 we only narrow the decoder protocol list — bandwidth
 * upgrades would require matching data on real hardware before we
 * flip `bandwidthMhz`. Tokens that don't match anything we profile
 * are ignored so the driver stays stable on unseen firmwares.
 */
export async function refineSdsProfile(
  base: SdsProfile,
  port: ScpiPort,
): Promise<SdsProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;
  const allow = new Set<OscilloscopeDecoderProtocol>();
  for (const token of options) {
    if (/I2C/i.test(token)) allow.add("i2c");
    if (/SPI/i.test(token)) allow.add("spi");
    if (/UART|RS232/i.test(token)) allow.add("uart");
    if (/CAN/i.test(token)) allow.add("can");
    if (/LIN/i.test(token)) allow.add("lin");
  }
  if (allow.size === 0) return base;
  const filtered = base.decoderProtocols.filter((p) => allow.has(p));
  return filtered.length > 0
    ? { ...base, decoderProtocols: filtered }
    : base;
}
