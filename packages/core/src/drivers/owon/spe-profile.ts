import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Owon SPE PSU family profile.
 *
 * SPE firmware exposes a minimal SCPI surface: `VOLTage` / `CURRent`
 * setpoint, `OUTPut` gate, `MEASure:VOLTage?` / `MEASure:CURRent?`.
 * Most SKUs are single-output; the "triple" SPE3103 / SPE3051 have
 * 3 independent rails accessible via `INSTrument:NSELect`.
 *
 * We deliberately **do not** advertise `pairing`, `tracking`, or per-
 * channel protection — the firmware lacks SCPI hooks for these. The
 * protection capability surface is tracked as a community-report
 * promotion path.
 */
export interface SpeChannelProfile {
  readonly id: number;
  readonly label: string;
  readonly voltageMax: number;
  readonly currentMax: number;
}

export interface SpeProfile {
  readonly variant: string;
  readonly channels: readonly SpeChannelProfile[];
  readonly presetSlots: number;
}

function channel(
  id: number,
  label: string,
  voltageMax: number,
  currentMax: number,
): SpeChannelProfile {
  return { id, label, voltageMax, currentMax };
}

export const SPE_VARIANTS: readonly SpeProfile[] = [
  // Triple-output SPE3103 — 3 × 30 V / 3 A per the product sheet.
  {
    variant: "SPE3103",
    channels: [
      channel(1, "CH1", 30, 3),
      channel(2, "CH2", 30, 3),
      channel(3, "CH3", 5, 3),
    ],
    presetSlots: 0,
  },
  // SPE3051 mirrors SPE3103 with lower current.
  {
    variant: "SPE3051",
    channels: [
      channel(1, "CH1", 30, 5),
      channel(2, "CH2", 30, 5),
      channel(3, "CH3", 5, 3),
    ],
    presetSlots: 0,
  },
  // SPE6053 / SPE6103 are higher-power single-output benches.
  {
    variant: "SPE6053",
    channels: [channel(1, "CH1", 60, 5)],
    presetSlots: 0,
  },
  {
    variant: "SPE6103",
    channels: [channel(1, "CH1", 60, 10)],
    presetSlots: 0,
  },
];

/**
 * Conservative catch-all: single-output 30 V / 3 A covers the most
 * common unknown-SKU path.
 */
export const SPE_DEFAULT: SpeProfile = {
  variant: "SPExxxx",
  channels: [channel(1, "CH1", 30, 3)],
  presetSlots: 0,
};

/**
 * SPE refinement: `*OPT?` is rarely supported; we accept empty. The
 * hook shape is preserved so a future firmware revision that gates
 * features via `*OPT?` can plug in without touching the driver.
 */
export async function refineSpeProfile(
  base: SpeProfile,
  port: ScpiPort,
): Promise<SpeProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
