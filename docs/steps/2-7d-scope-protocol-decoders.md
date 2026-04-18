# 2.7d — Scope protocol decoders

Parent: [2.7 — Scope advanced features](./2-7-scope-advanced-features.md).
Depends on: 2.7a (trigger tab already surfaces the serial-trigger kinds;
2.7d adds the matching decoder configuration and packet stream).

## Goal

Turn the DHO800's included **I²C / SPI / UART (RS-232) / CAN / LIN**
protocol decoders into a first-class feature: per-bus configuration
through typed forms, a live **NDJSON packet stream** from the
instrument, and a virtualised packet list the operator can scroll
without the UI melting.

## Scope

### Facade additions (all optional)

```ts
export type OscilloscopeDecoderKind = "i2c" | "spi" | "uart" | "can" | "lin";

export interface OscilloscopeDecoderCapability {
  readonly buses: number;                  // how many concurrent buses (DHO800: 2)
  readonly kinds: readonly OscilloscopeDecoderKind[];
}

// Each protocol gets its own config shape; the union keeps payload
// validation honest on both server and web.
export type OscilloscopeDecoderConfig =
  | { kind: "i2c"; sclSource: string; sdaSource: string;
      addressWidth: 7 | 10; sclThreshold: number; sdaThreshold: number; }
  | { kind: "spi"; csSource?: string; clkSource: string; dataSource: string;
      clockSlope: "rising" | "falling"; bitOrder: "msb" | "lsb";
      wordWidth: number; csPolarity?: "activeLow" | "activeHigh"; }
  | { kind: "uart"; rxSource: string; txSource?: string; baudRate: number;
      dataBits: 5 | 6 | 7 | 8 | 9; parity: "none" | "even" | "odd";
      stopBits: 1 | 1.5 | 2; bitOrder: "msb" | "lsb"; polarity: "normal" | "inverted"; }
  | { kind: "can"; source: string; signal: "H" | "L" | "differential";
      baudRate: number; samplePoint: number; /* 0..1 */ }
  | { kind: "lin"; source: string; baudRate: number;
      version: "1.3" | "2.x" | "j2602"; };

export interface OscilloscopeDecoderBusState {
  readonly busId: number;                  // 1-based
  readonly visible: boolean;
  readonly config: OscilloscopeDecoderConfig | null;
}

export interface OscilloscopeDecodedPacket {
  readonly seq: number;                    // monotonic per bus
  readonly busId: number;
  readonly kind: OscilloscopeDecoderKind;
  readonly timestamp: number;              // ms, best-effort
  readonly offsetSec: number;              // time from trigger
  /** Protocol-specific fields, intentionally loose so vendor variation fits. */
  readonly fields: Readonly<Record<string, string | number | boolean>>;
  readonly errors?: readonly string[];     // framing errors, ACK missing, …
}
```

Methods (all optional):

- `listBuses?(): Promise<readonly OscilloscopeDecoderBusState[]>`.
- `configureBus?(busId: number, config: OscilloscopeDecoderConfig | null): Promise<void>`
  — `null` turns the bus off.
- `setBusVisible?(busId: number, visible: boolean): Promise<void>`.
- `getDecodedPackets?(busId: number, since?: number): Promise<readonly OscilloscopeDecodedPacket[]>`.

### REST surface

- `GET  /api/sessions/:id/scope/buses` — capability + each bus state.
- `GET  /api/sessions/:id/scope/buses/:id` — one bus, detailed.
- `POST /api/sessions/:id/scope/buses/:id` — body
  `{ config: OscilloscopeDecoderConfig | null, visible?: boolean }`.
- `GET  /api/sessions/:id/scope/buses/:id/packets?since=<seq>` — NDJSON
  stream, flushed as packets arrive. Clients resume with the last seen
  `seq`.

Validation: `busId` out of range → 400; `kind` not in
`capability.kinds` → 400; per-kind field validation (e.g. UART `baudRate`
> 0, `addressWidth` in `{7, 10}`, SPI `wordWidth` in 4…32); capability
missing → 409.

### UI additions on the scope detail page

One new tab:

- **Decoders** tab
  - Two bus cards (on the DHO800), each with:
    - Protocol drop-down filtered to `capability.kinds`; "Off" option
      turns the bus off.
    - Protocol-specific form rendered by a switch on `kind`:
      - **I²C** — SCL / SDA source pickers, address-width radio (7 /
        10), optional threshold inputs.
      - **SPI** — CS / CLK / MOSI / MISO sources, clock slope, bit
        order, word width, CS polarity.
      - **UART** — RX / optional TX sources, baud rate, data bits,
        parity, stop bits, bit order, polarity.
      - **CAN** — source, signal type, baud rate, sample point slider.
      - **LIN** — source, baud rate, version selector.
    - Visible toggle per bus.
  - Packet list beneath the bus cards:
    - Virtualised so long captures don't tank scroll performance.
    - Columns are protocol-aware: I²C shows address + R/W + data; SPI
      shows MOSI + MISO; UART shows byte + parity status; CAN shows
      arb ID + DLC + payload; LIN shows ID + data.
    - Filters: by bus, by kind (when both buses differ), and by error
      presence.
    - Auto-scroll toggle; pause-scroll when the user is reading.
    - Export-CSV button dumps the visible subset.

## Acceptance criteria

- [x] `IOscilloscope` gains an optional `decoders` capability plus the
      methods above; `OscilloscopeDecoderConfig` is a discriminated
      union so per-kind payloads stay type-safe on both sides of the
      wire.
- [x] `RigolDho800` advertises `decoders` with `buses: 2` and
      `protocols: ["i2c", "spi", "uart", "can", "lin"]`, and wires
      each protocol's configuration to the DHO800 `:BUS<N>:*` SCPI
      commands from the programming guide.
- [x] REST endpoints validate per-kind bodies and source references
      against the currently-enabled channels, return 409 on
      unsupported, and serve `/packets` with `since=<seq>`
      continuation. *(The first cut is a JSON polling endpoint with
      `since=` paging backed by an in-memory buffer; the richer
      streaming NDJSON variant is tracked as a follow-up so the
      virtualised packet list can graduate without breaking the wire
      format.)*
- [~] UI decoder cards show bus status + an Off / Disable control and
      reflect the current kind. *(Per-protocol configuration forms —
      threshold / polarity / baud / etc. — and the virtualised packet
      list with CSV export are intentionally deferred to the v2
      "protocol-decoder waterfall" backlog item; the current UI covers
      the 2.7a serial-trigger workflow plus bus on/off and surfaces
      the existing configuration read from the instrument.)*
- [ ] Packet list stays responsive (scroll at 60 fps on the reference
      hardware with at least 10 000 rows); auto-scroll pauses when the
      user scrolls up and resumes on a "jump to latest" button.
      *(Deferred with the full packet-list UI — see above.)*
- [ ] CSV export columns match the visible columns for the active
      protocol; export includes a header row with units where
      applicable. *(Deferred with the full packet-list UI — see
      above.)*
- [x] Unit tests cover one configuration per protocol kind (at
      minimum), Off (null) configuration, bus-visibility / disable,
      packet parsing from the instrument's reply format, and
      `since=<seq>` paging.
- [x] Integration tests cover `/scope/buses`, `/scope/buses/:id`, and
      `/scope/buses/:id/packets` — capability gating, per-kind
      validation, SCPI side-effects, and resumable packet paging.

Legend: `[x]` shipped · `[~]` shipped with reduced scope (see inline
note) · `[ ]` deferred to the backlog entry linked above.

## Notes

- Serial-protocol **triggers** land in 2.7a; this slice adds the
  decoder configuration that inspects the captured frame. The two are
  deliberately decoupled — operators often trigger on one signal and
  decode a different one.
- The richer "decoder waterfall" visualization (synchronized lanes
  above the hero uPlot) is a V2 follow-up — deliberately not in
  2.7d. The virtualised list covers 90 % of what bench operators
  actually use.
- Packet field names stay protocol-specific (`Record<string, …>`
  rather than a closed enum) because vendor SCPI replies differ in
  subtle ways (e.g. I²C read/write encoded as `R` vs `READ`). The
  driver normalises what it can and passes the rest through.
- When 5.1's event bus lands, each new packet also emits a
  `decoderPacket` event so the 5.4 timeline can mark protocol traffic
  alongside scope triggers and PSU output changes.
