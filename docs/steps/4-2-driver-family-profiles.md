# 4.2 — Driver family profiles + `*OPT?` refinement

## Goal

Turn the existing per-model Rigol drivers into **profile-driven family
drivers** so one class serves every variant in a family (DHO800, DP900,
DM800) with **correct capability advertisements** per variant, and so the
capability tables can be **refined at connect time** with information only
the specific unit knows (installed options, actual channel count, memory
ceiling). Vendors cover their whole range with a handful of families rather
than a file per SKU; future vendor packs (4.6 / 4.7 / 4.8) inherit the same
pattern.

This is foundation work for the rest of Epic 4 — **do this before** shipping
Siglent / Keysight / Owon vendor packs, or those packs will duplicate the
per-SKU file pattern we're replacing.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 4 (vendor and family coverage expansion).
- Related:
  - [1-4-vendor-packs-rigol.md](1-4-vendor-packs-rigol.md) — the drivers being refactored.
  - [4-1-scpi-mock-instrument.md](4-1-scpi-mock-instrument.md) — the simulator that validates variant capability tables without hardware.
  - [4-6-vendor-pack-siglent.md](4-6-vendor-pack-siglent.md) / [4-7-vendor-pack-keysight.md](4-7-vendor-pack-keysight.md) / [4-8-vendor-pack-owon.md](4-8-vendor-pack-owon.md) — downstream consumers.

## Acceptance criteria

- [x] **Renames**: `packages/core/src/drivers/rigol/dho804.ts` → `dho800.ts`, `dp932e.ts` → `dp900.ts`, `dm858.ts` → `dm800.ts`. Class `RigolDm858` renamed to `RigolDm800` with a deprecation re-export (`export { RigolDm800 as RigolDm858 }`) in `drivers/rigol/index.ts` for one release window.
- [x] **Profile types**: per-family profile interface (`Dho800Profile`, `Dp900Profile`, `Dm800Profile`) capturing the variant-dependent fields that today live as file-level `const`s. Initial minimum set:
  - DHO800 — `channels: 2 | 4`, `bandwidthMhz`, `bwLimits`, `memoryDepths`, `decoderBuses`, `referenceSlots`, `decoderProtocols` (allowlist used to drop unlicensed decoders).
  - DP900 — `channels`, per-channel `{ voltageMax, currentMax, ovpRange, ocpRange }`, `pairingChannels`, `trackingChannels`, `presetSlots`.
  - DM800 — `modes`, per-mode `ranges`, `nplcOptions`, `dbmReferences`, `transducers`, `dualDisplayPairs`.
- [x] **Driver classes accept a profile in their constructor** and derive `CHANNEL_IDS`, capability tables, and advertised lists from the profile. No variant-specific constants remain at file scope except genuinely-shared SCPI opcode maps (measurement keywords, couplings, math operators, acquisition-mode encoders).
- [x] **Variant tables** per family in `drivers/rigol/*-profile.ts` listing the SKUs we know about with their profile values. Current coverage: DHO802 / DHO804 / DHO812 / DHO814; DP932E / DP932U / DP912; DM858 / DM858E. The table is the only thing a maintainer edits to support a new variant.
- [x] **Registry loop**: `registerRigolDrivers` iterates each family's variant table and registers one `DriverEntry` per SKU with an anchored regex (`/^DHO804\b/i`) plus a conservative catch-all (`/^DHO8\d{2}/i`, id `rigol-dho800`) so unknown variants still connect.
- [x] **`refine(port, identity)` hook**: optional, declared on `DriverEntry`, returns a replacement `create` function. Session manager awaits it after `*IDN?` resolution; failures fall back to `entry.create` so a flaky probe never blocks a connect. Matching implementations in place for every family:
  - DHO800 — `*OPT?` narrows `decoderProtocols` by SD-IIC / SD-SPI / SD-RS232 / SD-CAN / SD-LIN license tokens; `:CHANnel4:DISPlay?` probe self-corrects a 2-channel SKU that resolved against the 4-channel catch-all profile.
  - DP900 — tries `:SYSTem:CHANnel:COUNt?`, falls back to probing `:SOURce<N>:VOLTage?` per channel.
  - DM800 — `*OPT?` looks for `DM-4W` and re-adds `fourWireResistance` on DM858E when present.
- [x] **Shared helpers** moved to `drivers/rigol/_shared/` (`parseBool`, `parseNumberOrZero`, `queryOptList`, `parseOptList`). Every family driver now imports from the shared module; the previous duplicate helpers were deleted. Couplings / preamble parsers stay in `dho800.ts` because only the scope driver uses them today, but they're the next candidates when a second vendor pack needs the same shape.
- [x] **Tests** — `packages/core/test/rigol-profiles.test.ts` iterates every variant table and asserts registry id, driver kind, and profile values; `refine*` tests cover the `*OPT?` narrowing paths. `packages/sim/test/integration.test.ts` hot-swaps `*IDN?` across DHO802 / 04 / 12 / 14 against a single simulator process and verifies each resolves to the matching per-variant entry.
- [x] **No behavior change on real hardware** — DHO804 / DP932E / DM858 continue to use the same SCPI commands; only the capability advertisements change (and they match the old file-level constants exactly for those variants). The `RigolDm858` alias keeps downstream `@lxi-web/core` consumers source-compatible.
- [ ] **LXI identification document** fetch stays out of scope for this step — `*IDN?` + `*OPT?` cover what we need for profile resolution. Fetching `/lxi/identification` is a candidate for a later enhancement and is **not** required here.
- [x] **Docs**: this step doc records the variant matrix, the refinement contract, and the catch-all fallback. Cross-link from 4.9 added when the contributor guide lands.

## Design sketch

```typescript
// packages/core/src/drivers/rigol/dho800-profile.ts
export interface Dho800Profile {
  readonly variant: string;
  readonly channels: 2 | 4;
  readonly bandwidthMhz: 70 | 100 | 200 | 250;
  readonly bwLimits: readonly OscilloscopeChannelBandwidthLimit[];
  readonly memoryDepths: readonly OscilloscopeMemoryDepth[];
  readonly decoderBuses: number;
  readonly decoderProtocols: readonly OscilloscopeDecoderProtocol[];
  readonly referenceSlots: number;
}

export const DHO800_VARIANTS: readonly Dho800Profile[] = [
  { variant: "DHO802", channels: 2, bandwidthMhz: 70,  /* ... */ },
  { variant: "DHO804", channels: 4, bandwidthMhz: 70,  /* ... */ },
  { variant: "DHO812", channels: 2, bandwidthMhz: 100, /* ... */ },
  { variant: "DHO814", channels: 4, bandwidthMhz: 100, /* ... */ },
];

export const DHO800_DEFAULT: Dho800Profile = { /* conservative */ };

export async function refineDho800Profile(
  base: Dho800Profile,
  port: ScpiPort,
): Promise<Dho800Profile> { /* *OPT? + channel probe */ }
```

```typescript
// packages/core/src/drivers/rigol/index.ts
for (const variant of DHO800_VARIANTS) {
  registry.register({
    id: `rigol-${variant.variant.toLowerCase()}`,
    kind: "oscilloscope",
    match: { manufacturer: "rigol", model: new RegExp(`^${variant.variant}\\b`, "i") },
    create: (port, identity) => new RigolDho800(port, identity, variant),
    refine: (port) => refineDho800Profile(variant, port),
  });
}
registry.register({
  id: "rigol-dho800-generic",
  kind: "oscilloscope",
  match: { manufacturer: "rigol", model: /^DHO8\d{2}/i },
  create: (port, identity) => new RigolDho800(port, identity, DHO800_DEFAULT),
  refine: (port) => refineDho800Profile(DHO800_DEFAULT, port),
});
```

## Notes

- Sharing driver classes across families (DHO800 ↔ MSO5000, or DHO800 ↔ Siglent SDS) is **not** a goal — SCPI dialects diverge. Sharing helpers, yes; sharing classes, no.
- `refine()` is an opt-in performance/accuracy improvement, not a contract. Drivers without a refiner fall back to their declared profile. Adding a refiner later is a non-breaking change.
- Keeping the `RigolDm858` deprecation re-export means downstream users of `@lxi-web/core` (post-3.7 publish) don't break on this refactor. Drop it in the next minor.
- The `refine()` call site belongs in the SessionManager right after `*IDN?` resolves a `DriverEntry`. Keep the refine timeout tight (≤ 1.5 s) so a slow instrument doesn't stall the connect path — timeouts fall back to the base profile with a warning, never a failure.
- This step is the last time we lock constants per-SKU; from here on, **new variants are data**, not code.
