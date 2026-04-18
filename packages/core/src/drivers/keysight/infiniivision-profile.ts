import type { ScpiPort } from "../../scpi/port.js";
import type { OscilloscopeDecoderProtocol } from "../../facades/oscilloscope.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Variant-specific capability profile for the Keysight InfiniiVision
 * 1000X / 2000X / 3000T / 4000X / 6000X range. The SCPI dialect is
 * uniform across the family — what differs is bandwidth, sample rate,
 * memory depth, MSO digital-channel count, and the decoder licences
 * the firmware honours.
 *
 * MSO variants (MSOX2024A, MSOX3034T ...) share the same driver; the
 * `digitalChannels` field carries either the physical channel count
 * (usually 16) or `0` for DSO-only units. UI rendering of logic lanes
 * is tracked as backlog; the profile only declares the capability
 * shape here.
 */
export interface InfiniiVisionProfile {
  readonly variant: string;
  readonly channels: number;
  readonly bandwidthMhz: number;
  readonly maxSampleRateGsPs: number;
  readonly memoryDepths: readonly number[];
  readonly bandwidthLimits: readonly ("off" | "20M" | "100M" | "200M")[];
  readonly decoderBuses: number;
  readonly decoderProtocols: readonly OscilloscopeDecoderProtocol[];
  readonly referenceSlots: number;
  readonly presetSlots: number;
  readonly digitalChannels: number;
  /**
   * Pre-2014 firmware occasionally spells `CHANnel` differently; the
   * 4.7 driver always uses the modern long form and this flag is
   * reserved for a future legacy Agilent split.
   */
  readonly dialect: "infiniivision-modern";
}

const IV_DECODERS: readonly OscilloscopeDecoderProtocol[] = [
  "i2c",
  "spi",
  "uart",
  "can",
  "lin",
];

export const INFINIIVISION_VARIANTS: readonly InfiniiVisionProfile[] = [
  // ---- 1000X-series ----
  {
    variant: "DSOX1102A",
    channels: 2,
    bandwidthMhz: 70,
    maxSampleRateGsPs: 2,
    memoryDepths: [100e3, 1e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 1,
    decoderProtocols: ["i2c", "spi", "uart"],
    referenceSlots: 2,
    presetSlots: 10,
    digitalChannels: 0,
    dialect: "infiniivision-modern",
  },
  {
    variant: "DSOX1102G",
    channels: 2,
    bandwidthMhz: 70,
    maxSampleRateGsPs: 2,
    memoryDepths: [100e3, 1e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 1,
    decoderProtocols: ["i2c", "spi", "uart"],
    referenceSlots: 2,
    presetSlots: 10,
    digitalChannels: 0,
    dialect: "infiniivision-modern",
  },
  {
    variant: "DSOX1204A",
    channels: 4,
    bandwidthMhz: 70,
    maxSampleRateGsPs: 2,
    memoryDepths: [100e3, 1e6, 2e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 2,
    decoderProtocols: IV_DECODERS,
    referenceSlots: 2,
    presetSlots: 10,
    digitalChannels: 0,
    dialect: "infiniivision-modern",
  },
  {
    variant: "DSOX1204G",
    channels: 4,
    bandwidthMhz: 70,
    maxSampleRateGsPs: 2,
    memoryDepths: [100e3, 1e6, 2e6],
    bandwidthLimits: ["off", "20M"],
    decoderBuses: 2,
    decoderProtocols: IV_DECODERS,
    referenceSlots: 2,
    presetSlots: 10,
    digitalChannels: 0,
    dialect: "infiniivision-modern",
  },
  // ---- 2000X-series ----
  ...((): InfiniiVisionProfile[] => {
    const base = {
      maxSampleRateGsPs: 2,
      memoryDepths: [100e3, 1e6],
      bandwidthLimits: ["off", "20M"] as const,
      decoderBuses: 2,
      decoderProtocols: IV_DECODERS,
      referenceSlots: 2,
      presetSlots: 10,
      digitalChannels: 0,
      dialect: "infiniivision-modern" as const,
    };
    const entries: readonly [string, number, number][] = [
      ["DSOX2002A", 2, 70],
      ["DSOX2004A", 4, 70],
      ["DSOX2012A", 2, 100],
      ["DSOX2014A", 4, 100],
      ["DSOX2022A", 2, 200],
      ["DSOX2024A", 4, 200],
    ];
    return entries.map(([variant, channels, bandwidthMhz]) => ({
      variant,
      channels,
      bandwidthMhz,
      ...base,
    }));
  })(),
  ...((): InfiniiVisionProfile[] => {
    const base = {
      maxSampleRateGsPs: 2,
      memoryDepths: [100e3, 1e6],
      bandwidthLimits: ["off", "20M"] as const,
      decoderBuses: 2,
      decoderProtocols: IV_DECODERS,
      referenceSlots: 2,
      presetSlots: 10,
      digitalChannels: 8,
      dialect: "infiniivision-modern" as const,
    };
    const entries: readonly [string, number, number][] = [
      ["MSOX2002A", 2, 70],
      ["MSOX2004A", 4, 70],
      ["MSOX2012A", 2, 100],
      ["MSOX2014A", 4, 100],
      ["MSOX2022A", 2, 200],
      ["MSOX2024A", 4, 200],
    ];
    return entries.map(([variant, channels, bandwidthMhz]) => ({
      variant,
      channels,
      bandwidthMhz,
      ...base,
    }));
  })(),
  // ---- 3000T-series (capacitive-touch) ----
  ...((): InfiniiVisionProfile[] => {
    const dso = {
      maxSampleRateGsPs: 5,
      memoryDepths: [1e6, 2e6, 4e6],
      bandwidthLimits: ["off", "20M"] as const,
      decoderBuses: 2,
      decoderProtocols: IV_DECODERS,
      referenceSlots: 4,
      presetSlots: 10,
      digitalChannels: 0,
      dialect: "infiniivision-modern" as const,
    };
    const mso = { ...dso, digitalChannels: 16 };
    const entries: readonly [string, number, number, boolean][] = [
      ["DSOX3024T", 4, 200, false],
      ["DSOX3034T", 4, 350, false],
      ["DSOX3054T", 4, 500, false],
      ["DSOX3104T", 4, 1000, false],
      ["MSOX3024T", 4, 200, true],
      ["MSOX3034T", 4, 350, true],
      ["MSOX3054T", 4, 500, true],
      ["MSOX3104T", 4, 1000, true],
    ];
    return entries.map(([variant, channels, bandwidthMhz, isMso]) => ({
      variant,
      channels,
      bandwidthMhz,
      ...(isMso ? mso : dso),
    }));
  })(),
  // ---- 4000X-series ----
  ...((): InfiniiVisionProfile[] => {
    const dso = {
      maxSampleRateGsPs: 5,
      memoryDepths: [1e6, 2e6, 4e6],
      bandwidthLimits: ["off", "20M", "200M"] as const,
      decoderBuses: 4,
      decoderProtocols: IV_DECODERS,
      referenceSlots: 4,
      presetSlots: 10,
      digitalChannels: 0,
      dialect: "infiniivision-modern" as const,
    };
    const mso = { ...dso, digitalChannels: 16 };
    const entries: readonly [string, number, number, boolean][] = [
      ["DSOX4024A", 4, 200, false],
      ["DSOX4034A", 4, 350, false],
      ["DSOX4054A", 4, 500, false],
      ["DSOX4104A", 4, 1000, false],
      ["DSOX4154A", 4, 1500, false],
      ["MSOX4024A", 4, 200, true],
      ["MSOX4034A", 4, 350, true],
      ["MSOX4054A", 4, 500, true],
      ["MSOX4104A", 4, 1000, true],
      ["MSOX4154A", 4, 1500, true],
    ];
    return entries.map(([variant, channels, bandwidthMhz, isMso]) => ({
      variant,
      channels,
      bandwidthMhz,
      ...(isMso ? mso : dso),
    }));
  })(),
  // ---- 6000X-series ----
  ...((): InfiniiVisionProfile[] => {
    const dso = {
      maxSampleRateGsPs: 20,
      memoryDepths: [4e6, 8e6, 16e6],
      bandwidthLimits: ["off", "20M", "200M"] as const,
      decoderBuses: 4,
      decoderProtocols: IV_DECODERS,
      referenceSlots: 4,
      presetSlots: 10,
      digitalChannels: 0,
      dialect: "infiniivision-modern" as const,
    };
    const mso = { ...dso, digitalChannels: 16 };
    const entries: readonly [string, number, number, boolean][] = [
      ["DSOX6002A", 2, 1000, false],
      ["DSOX6004A", 4, 1000, false],
      ["DSOX6012A", 2, 2500, false],
      ["DSOX6014A", 4, 2500, false],
      ["MSOX6002A", 2, 1000, true],
      ["MSOX6004A", 4, 1000, true],
      ["MSOX6012A", 2, 2500, true],
      ["MSOX6014A", 4, 2500, true],
    ];
    return entries.map(([variant, channels, bandwidthMhz, isMso]) => ({
      variant,
      channels,
      bandwidthMhz,
      ...(isMso ? mso : dso),
    }));
  })(),
];

/** Conservative catch-all: 4ch / 200 MHz / 2 Msa matches a DSOX2024A. */
export const INFINIIVISION_DEFAULT: InfiniiVisionProfile = {
  variant: "DSOXxxxx",
  channels: 4,
  bandwidthMhz: 200,
  maxSampleRateGsPs: 2,
  memoryDepths: [100e3, 1e6],
  bandwidthLimits: ["off", "20M"],
  decoderBuses: 2,
  decoderProtocols: IV_DECODERS,
  referenceSlots: 2,
  presetSlots: 10,
  digitalChannels: 0,
  dialect: "infiniivision-modern",
};

/**
 * InfiniiVision refinement. `*OPT?` surfaces decoder licences
 * (`CAN`, `I2C`, `RS232`, `FLEX` etc.), bandwidth unlocks
 * (`BW-200`, `BW-500`), and MSO upgrades. For 4.7 we only narrow the
 * decoder protocol set — bandwidth / MSO upgrades would need matching
 * hardware reports before we mutate those numeric capability fields.
 */
export async function refineInfiniiVisionProfile(
  base: InfiniiVisionProfile,
  port: ScpiPort,
): Promise<InfiniiVisionProfile> {
  const options = await queryOptList(port);
  if (options.length === 0) return base;
  const allow = new Set<OscilloscopeDecoderProtocol>();
  for (const tok of options) {
    if (/I2C|IIC/i.test(tok)) allow.add("i2c");
    if (/\bSPI\b/i.test(tok)) allow.add("spi");
    if (/UART|RS232|RS-232/i.test(tok)) allow.add("uart");
    if (/\bCAN\b/i.test(tok)) allow.add("can");
    if (/\bLIN\b/i.test(tok)) allow.add("lin");
  }
  if (allow.size === 0) return base;
  const filtered = base.decoderProtocols.filter((p) => allow.has(p));
  return filtered.length > 0 ? { ...base, decoderProtocols: filtered } : base;
}
