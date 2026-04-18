import type { ScpiPort } from "../../scpi/port.js";
import type { DeviceIdentity } from "../../identity/idn.js";
import type {
  IPowerSupply,
  PsuChannelLimits,
  PsuChannelState,
  PsuMeasurement,
} from "../../facades/power-supply.js";
import { parseBool, parseNumberOrZero, safeQuery } from "./_shared/index.js";
import {
  type FlukeCalibratorProfile,
  CALIBRATOR_DEFAULT,
} from "./calibrator-profile.js";

/**
 * Fluke 5500 / 5700 multi-function calibrator driver.
 *
 * Exposed through the `IPowerSupply` façade with a narrow single-channel
 * shape:
 *   - `OUT <value>,V` / `OUT <value>,A` sets the output quantity.
 *   - `OPER` / `STBY` toggle operate vs standby.
 *   - `OUT?` reports the present output (tuple of value + unit).
 *
 * Compliance / trip readbacks live under `ISR?`; we surface them via
 * the `measureChannel` hook's `voltage` / `current` readings. Advanced
 * calibration sequences (artefact cal, multi-point verification) are
 * intentionally out of scope — users run those through Fluke MET/CAL
 * or 9500 Procedure Runner.
 */
export class FlukeCalibrator implements IPowerSupply {
  readonly kind = "powerSupply" as const;
  readonly profile: FlukeCalibratorProfile;
  readonly #limits: PsuChannelLimits;

  #setVoltage = 0;
  #setCurrent = 0;
  /**
   * Tracks which domain the calibrator was most recently commanded to
   * source. `OUT <value>,V` and `OUT <value>,A` are mutually exclusive —
   * we toggle our own view so the UI doesn't chase its tail when the
   * user swaps between voltage and current modes.
   */
  #mode: "voltage" | "current" = "voltage";

  constructor(
    private readonly port: ScpiPort,
    readonly identity: DeviceIdentity,
    profile: FlukeCalibratorProfile = CALIBRATOR_DEFAULT,
  ) {
    this.profile = profile;
    this.#limits = {
      voltageMax: profile.voltageMaxDc,
      currentMax: profile.currentMaxDc,
    };
  }

  async getChannels(): Promise<PsuChannelState[]> {
    const [outRaw, operRaw] = await Promise.all([
      safeQuery(this.port, "OUT?"),
      safeQuery(this.port, "OPER?"),
    ]);
    const parsed = parseOutputQuery(outRaw);
    if (parsed) {
      if (parsed.unit === "V") this.#setVoltage = parsed.value;
      if (parsed.unit === "A") this.#setCurrent = parsed.value;
    }
    return [
      {
        id: 1,
        label: "OUT",
        setVoltage: this.#setVoltage,
        setCurrent: this.#setCurrent,
        measuredVoltage: this.#mode === "voltage" ? this.#setVoltage : 0,
        measuredCurrent: this.#mode === "current" ? this.#setCurrent : 0,
        output: parseBool(operRaw),
        limits: this.#limits,
      },
    ];
  }

  async setChannelOutput(channel: number, enabled: boolean): Promise<void> {
    this.#assertChannel(channel);
    await this.port.write(enabled ? "OPER" : "STBY");
  }

  async setChannelVoltage(channel: number, volts: number): Promise<void> {
    this.#assertChannel(channel);
    if (!Number.isFinite(volts)) throw new Error(`invalid voltage ${volts}`);
    const clamped = Math.min(this.profile.voltageMaxDc, Math.max(-this.profile.voltageMaxDc, volts));
    this.#setVoltage = clamped;
    this.#mode = "voltage";
    await this.port.write(`OUT ${clamped},V`);
  }

  async setChannelCurrent(channel: number, amps: number): Promise<void> {
    this.#assertChannel(channel);
    if (!Number.isFinite(amps)) throw new Error(`invalid current ${amps}`);
    const clamped = Math.min(this.profile.currentMaxDc, Math.max(-this.profile.currentMaxDc, amps));
    this.#setCurrent = clamped;
    this.#mode = "current";
    await this.port.write(`OUT ${clamped},A`);
  }

  async measureChannel(channel: number): Promise<PsuMeasurement> {
    this.#assertChannel(channel);
    const raw = await safeQuery(this.port, "OUT?");
    const parsed = parseOutputQuery(raw);
    const voltage =
      parsed?.unit === "V" ? parsed.value : this.#mode === "voltage" ? this.#setVoltage : 0;
    const current =
      parsed?.unit === "A" ? parsed.value : this.#mode === "current" ? this.#setCurrent : 0;
    return {
      channel: 1,
      voltage,
      current,
      power: voltage * current,
      measuredAt: Date.now(),
    };
  }

  #assertChannel(channel: number): void {
    if (channel !== 1) {
      throw new Error(
        `Fluke ${this.profile.variant} calibrator only exposes channel 1`,
      );
    }
  }
}

/**
 * Parse `OUT?` replies which come back as `"<value>,<unit>,<freq>"`.
 * Units observed on real hardware: `V`, `A`, `OHM`, `HZ`, `F`. We only
 * care about V / A today.
 */
function parseOutputQuery(raw: string): { value: number; unit: "V" | "A" } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length < 2) return null;
  const value = parseNumberOrZero(parts[0]!);
  const unit = parts[1]!.toUpperCase();
  if (unit === "V") return { value, unit: "V" };
  if (unit === "A") return { value, unit: "A" };
  return null;
}
