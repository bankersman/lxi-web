/**
 * The dashboard treats instruments by class, not by vendor. Keep this list
 * tight — a new entry means a new typed facade and a new dashboard surface.
 */
export type DeviceKind =
  | "oscilloscope"
  | "powerSupply"
  | "multimeter"
  | "electronicLoad"
  | "unknown";

export const DEVICE_KINDS: readonly DeviceKind[] = [
  "oscilloscope",
  "powerSupply",
  "multimeter",
  "electronicLoad",
  "unknown",
] as const;
