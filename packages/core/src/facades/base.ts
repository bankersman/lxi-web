import type { DeviceIdentity } from "../identity/idn.js";
import type { DeviceKind } from "../identity/kind.js";

/** Shared shape every typed facade exposes to the dashboard layer. */
export interface InstrumentFacade {
  readonly kind: DeviceKind;
  readonly identity: DeviceIdentity;
}
