export interface DeviceIdentity {
  readonly manufacturer: string;
  readonly model: string;
  readonly serial?: string;
  readonly firmware?: string;
  /** Raw `*IDN?` response with trailing whitespace trimmed. */
  readonly raw: string;
}

/**
 * Parse a `*IDN?` response into its four canonical fields. The SCPI spec
 * asks for `<manufacturer>,<model>,<serial>,<firmware>`, but firmware in the
 * wild is often extra `,`-separated fields; collapse the tail into `firmware`
 * so nothing is silently lost.
 */
export function parseIdn(raw: string): DeviceIdentity {
  const trimmed = raw.trim();
  const parts = trimmed.split(",").map((part) => part.trim());
  const [manufacturer = "", model = "", serial, ...rest] = parts;
  const firmware = rest.length > 0 ? rest.join(",") : undefined;
  return {
    manufacturer,
    model,
    serial: serial && serial.length > 0 ? serial : undefined,
    firmware: firmware && firmware.length > 0 ? firmware : undefined,
    raw: trimmed,
  };
}

/**
 * Short, human-readable name for a card title: "Manufacturer Model", with
 * common marketing suffixes stripped from the manufacturer field.
 */
export function shortIdentity(identity: DeviceIdentity): string {
  const vendor = identity.manufacturer
    .replace(/\b(technologies|technology|instruments|inc\.?|co\.?|ltd\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const pieces = [vendor, identity.model].filter((p) => p.length > 0);
  return pieces.join(" ");
}
