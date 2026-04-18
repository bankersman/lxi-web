/**
 * Encode `bytes` as an IEEE 488.2 definite-length block:
 *
 * ```
 * #<n><length><bytes>
 * ```
 *
 * where `<n>` is a single ASCII digit giving the number of digits in
 * `<length>`, and `<length>` is the byte-count of `<bytes>`. The result
 * does **not** include a trailing LF — the simulator transport appends
 * that uniformly.
 */
export function encodeIeee488Block(bytes: Uint8Array): Uint8Array {
  const lenStr = bytes.length.toString(10);
  if (lenStr.length > 9) {
    throw new Error(
      `IEEE 488.2 definite-length block length exceeds 9 digits: ${lenStr}`,
    );
  }
  const header = `#${lenStr.length}${lenStr}`;
  const headerBytes = new TextEncoder().encode(header);
  const out = new Uint8Array(headerBytes.length + bytes.length);
  out.set(headerBytes, 0);
  out.set(bytes, headerBytes.length);
  return out;
}
