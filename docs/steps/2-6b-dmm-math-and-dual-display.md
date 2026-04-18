# 2.6b — DMM math and dual display

Parent: [2.6 — DMM advanced features](./2-6-dmm-advanced-features.md).
Depends on: 2.6a (uses the `fourWireResistance` mode and the ranging
capability shape).

## Goal

Expose the `:CALCulate:*` math block — **null / dB / dBm / statistics /
pass-fail limits** — and the DM858's **dual display** (a secondary
readout alongside the primary measurement), both as capability-gated UI
cards on the DMM detail page.

## Scope

### Facade additions (all optional)

```ts
export type MultimeterMathFunction =
  | "none" | "null" | "db" | "dbm" | "stats" | "limit";

export interface MultimeterMathCapability {
  readonly functions: readonly MultimeterMathFunction[];
  /** Per-function list of modes where it's permitted (e.g. dBm is usually VAC/VDC only). */
  readonly allowedModes: Readonly<
    Record<MultimeterMathFunction, readonly MultimeterMode[]>
  >;
  readonly dbmReferences: readonly number[];   // ohms
}

export interface MultimeterMathConfig {
  readonly function: MultimeterMathFunction;
  readonly nullOffset?: number;
  readonly dbmReference?: number;
  readonly limitUpper?: number;
  readonly limitLower?: number;
}

export interface MultimeterMathState {
  readonly config: MultimeterMathConfig;
  readonly stats?: {
    readonly min: number;
    readonly max: number;
    readonly average: number;
    readonly stddev: number;
    readonly count: number;
  };
  readonly limitResult?: "pass" | "fail-high" | "fail-low";
}

export interface MultimeterDualDisplayCapability {
  /** Which secondary readouts are compatible with each primary mode. */
  readonly pairs: Readonly<Record<MultimeterMode, readonly MultimeterMode[]>>;
}

export interface MultimeterDualReading {
  readonly primary: MultimeterReading;
  readonly secondary: MultimeterReading;
}
```

Methods (all optional):

- `getMath?(): Promise<MultimeterMathState>`.
- `setMath?(config: MultimeterMathConfig): Promise<void>`.
- `fetchMathState?(): Promise<MultimeterMathState>` — re-query stats and
  limit result without changing config.
- `resetMathStatistics?(): Promise<void>` — `:CALCulate:AVERage:CLEar`.
- `setDualDisplay?(secondary: MultimeterMode | null): Promise<void>`.
- `readDual?(): Promise<MultimeterDualReading>`.

### REST surface

- `GET  /api/sessions/:id/dmm/math` — capability + current state.
- `POST /api/sessions/:id/dmm/math` — body is `MultimeterMathConfig`.
- `POST /api/sessions/:id/dmm/math/reset` — clear statistics.
- `GET  /api/sessions/:id/dmm/dual` — capability + current secondary mode.
- `POST /api/sessions/:id/dmm/dual` — body `{ secondary: mode | null }`.

Capability missing → `supported: false` on GET, `409` on POST. Limit
values outside the primary mode's active range → 400 with a pointer
to which bound failed.

### UI additions on the DMM detail page

- **Math** card with function selector (None / Null / dB / dBm / Stats /
  Limit) and function-specific controls:
  - **Null** — numeric offset field plus a **Snap current reading**
    button (issues `:CALCulate:NULL:ACQuire` or writes the current
    reading to `OFFSet`).
  - **dB / dBm** — reference-Ω drop-down filled from
    `capability.dbmReferences` (dB additionally accepts a numeric
    dB-reference field).
  - **Stats** — min / max / average / stddev / count readouts with a
    **Reset statistics** button.
  - **Limit** — upper / lower inputs, live pass / fail-high / fail-low
    badge.
- **Dual display** strip under the primary reading — on/off toggle plus
  a secondary-mode drop-down filtered to `pairs[currentPrimary]`. Shows
  the secondary value in a smaller font with its unit.

## Acceptance criteria

- [x] `IMultimeter` gains optional `math` and `dualDisplay` capabilities
      plus the methods above.
- [x] `RigolDm858` advertises `math` with the DM858 function list (NULL,
      DB, DBM, STATS via AVERage, LIMit) and `dualDisplay` with the
      DM858's actual compatibility matrix drawn from the programming
      guide. `dbmReferences` covers at least {50, 75, 600}.
- [x] REST endpoints advertise capability descriptor on GET, validate
      body (function not in capability → 400; mode not in
      `allowedModes[function]` → 400; secondary not in `pairs[primary]`
      → 400; missing capability → 409), and forward to the driver.
- [x] UI hides each card cleanly when unsupported; the pass/fail badge
      updates within one polling tick of a new reading; Snap-current
      button drives `:CALCulate:NULL:ACQuire` and leaves the offset
      visible in the input; secondary drop-down re-filters when the
      primary mode changes.
- [x] Unit tests cover the driver SCPI for each math function (enable
      state, function select, null offset write, null snap, dBm
      reference write, statistics query parsing, limit write, limit
      result parsing) and dual-display set/read.
- [x] Integration tests cover `/dmm/math`, `/dmm/math/reset`, and
      `/dmm/dual` — capability gating, input validation, and SCPI side-
      effects.

## Notes

- Statistics only fill meaningfully when readings arrive; 2.6c's trend
  recorder will be the usual driver, but short-term the card can just
  display whatever the DMM accumulates between Reset presses.
- dB vs dBm is intentionally separate in the UI because they take
  different reference parameters; internally both ride the same
  `:CALCulate:FUNCtion` machinery.
- If the DM858 exposes a more constrained compatibility matrix than
  `pairs[mode]` suggests, the driver should advertise the stricter
  list rather than the general SCPI ideal — keeps the UI honest.
