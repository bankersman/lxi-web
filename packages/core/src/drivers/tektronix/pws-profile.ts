import type { ScpiPort } from "../../scpi/port.js";
import { queryOptList } from "./_shared/index.js";

/**
 * Tektronix PWS series profile (PWS2000 / PWS4000).
 *
 * PWS is Tektronix's entry programmable bench PSU line. LXI support is
 * patchy across firmware drops — we list the SKUs with confirmed LXI
 * sockets and rely on the conservative catch-all for anything else.
 *
 * SCPI shape follows a SCPI-1999 single-output dialect with an
 * `INST:SEL OUT<n>` channel selector on multi-output chassis:
 *   - `INST:SEL OUT<n>`
 *   - `VOLT <v>` / `CURR <a>` set setpoints for the active channel.
 *   - `OUTP ON|OFF` toggles the active channel's relay.
 *   - `MEAS:VOLT?` / `MEAS:CURR?` return scalars for the active channel.
 *
 * Pairing / tracking / OVP / OCP SCPI is either absent or inconsistent
 * between firmware revisions; we deliberately don't advertise those
 * capabilities on the facade.
 */
export interface PwsChannelSpec {
  readonly id: number;
  readonly label: string;
  readonly voltageMax: number;
  readonly currentMax: number;
}

export interface PwsProfile {
  readonly variant: string;
  readonly channels: readonly PwsChannelSpec[];
}

export const PWS_VARIANTS: readonly PwsProfile[] = [
  // ---- PWS2000 — entry single-output ----
  {
    variant: "PWS2185",
    channels: [{ id: 1, label: "OUT1", voltageMax: 18, currentMax: 5 }],
  },
  {
    variant: "PWS2323",
    channels: [{ id: 1, label: "OUT1", voltageMax: 32, currentMax: 3 }],
  },
  {
    variant: "PWS2326",
    channels: [{ id: 1, label: "OUT1", voltageMax: 32, currentMax: 6 }],
  },
  {
    variant: "PWS2721",
    channels: [{ id: 1, label: "OUT1", voltageMax: 72, currentMax: 1.2 }],
  },
  // ---- PWS4000 — programmable with triple outputs on 4323 ----
  {
    variant: "PWS4205",
    channels: [{ id: 1, label: "OUT1", voltageMax: 20, currentMax: 5 }],
  },
  {
    variant: "PWS4305",
    channels: [{ id: 1, label: "OUT1", voltageMax: 30, currentMax: 5 }],
  },
  {
    variant: "PWS4323",
    channels: [
      { id: 1, label: "OUT1", voltageMax: 32, currentMax: 3 },
      { id: 2, label: "OUT2", voltageMax: 32, currentMax: 3 },
      { id: 3, label: "OUT3", voltageMax: 5, currentMax: 3 },
    ],
  },
  {
    variant: "PWS4602",
    channels: [{ id: 1, label: "OUT1", voltageMax: 60, currentMax: 2.5 }],
  },
  {
    variant: "PWS4721",
    channels: [{ id: 1, label: "OUT1", voltageMax: 72, currentMax: 1.2 }],
  },
];

/**
 * Conservative catch-all: 30 V / 3 A single output — the shape of the
 * majority of PWS SKUs. Multi-output boxes route through a per-SKU
 * profile; anything else that resolves via the catch-all only sees
 * OUT1 controls (safer than accidentally exposing non-existent rails).
 */
export const PWS_DEFAULT: PwsProfile = {
  variant: "PWSxxxx",
  channels: [{ id: 1, label: "OUT1", voltageMax: 30, currentMax: 3 }],
};

/**
 * PWS refinement. `*OPT?` on PWS firmware typically returns an empty
 * string; the hook exists for parity with the other families and
 * returns the base profile.
 */
export async function refinePwsProfile(
  base: PwsProfile,
  port: ScpiPort,
): Promise<PwsProfile> {
  const options = await queryOptList(port);
  void options;
  return base;
}
