import type { DeviceIdentity } from "../identity/idn.js";
import type { DeviceKind } from "../identity/kind.js";

export type SessionStatus = "connecting" | "connected" | "error";

/** Wire-safe session snapshot shared between server and web. */
export interface SessionSummary {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly status: SessionStatus;
  readonly kind: DeviceKind;
  readonly identity: DeviceIdentity | null;
  readonly driverId: string | null;
  readonly openedAt: number;
  readonly error: { readonly message: string } | null;
}

/** Default instrument SCPI port on LAN instruments. */
export const DEFAULT_SCPI_PORT = 5025;
