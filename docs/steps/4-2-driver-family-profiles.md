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

- [ ] **Renames**: `packages/core/src/drivers/rigol/dho804.ts` → `dho800.ts`, `dp932e.ts` → `dp900.ts`, `dm858.ts` → `dm800.ts`. Class `RigolDm858` renamed to `RigolDm800` with a deprecation re-export (`export { RigolDm800 as RigolDm858 }`) in `drivers/rigol/index.ts` for one release window.
- [ ] **Profile types**: per-family profile interface (`Dho800Profile`, `Dp900Profile`, `Dm800Profile`) capturing the variant-dependent fields that today live as file-level `const`s. Initial minimum set:
  - DHO800 — `channels: 2 | 4`, `bandwidthMhz`, `bwLimits`, `memoryDepths`, `decoderBuses`, `referenceSlots`, `protocols` (allowlist used to drop unlicensed decoders).
  - DP900 — `channels`, per-channel `{ voltageMax, currentMax, ovpRange, ocpRange }`, `pairingChannels`, `trackingChannels`, `presetSlots`.
  - DM800 — `modes`, per-mode `ranges`, `nplcOptions`, `dbmReferences`, `transducers`, `dualDisplayPairs`.
- [ ] **Driver classes accept a profile in their constructor** and derive `CHANNEL_IDS`, capability tables, and advertised lists from the profile. No variant-specific constants remain at file scope except genuinely-shared SCPI opcode maps.
- [ ] **Variant tables** per family in `drivers/rigol/*-profile.ts` listing the SKUs we know about with their profile values. At minimum: DHO802 / DHO804 / DHO812 / DHO814; DP932E / DP932U / DP912; DM858 / DM858E. The table is the only thing a maintainer edits to support a new variant.
- [ ] **Registry loop**: `registerRigolDrivers` iterates each family's variant table and registers one `DriverEntry` per SKU, each with a precise regex (`/^DHO804\b/i`) and the matching profile. A final **catch-all** entry per family keeps the broader regex (`/^DHO8\d{2}/i`) with a conservative default profile so unknown variants still connect.
- [ ] **`refine(profile, port)` hook**: optional per-family async function called right after identity is known. Runs `*OPT?` and a minimal probe set, returns a possibly-mutated profile. The session manager awaits the refined profile before the driver is instantiated. Existing identity resolution flow stays backwards-compatible (no refiner = no change).
  - DHO800 refiner: parse `*OPT?` for decoder licenses (`SD-IIC`, `SD-SPI`, `SD-RS232`, `SD-CAN`, `SD-LIN`), bandwidth upgrade licenses, memory-depth upgrades; probe channel count via `:CHANnel<N>:DISPlay?` so DHO802-as-DHO804-profile self-corrects.
  - DP900 refiner: confirm channel count from `:SYSTem:CHANnel:COUNt?` if supported; fall back to probing `:SOURce<N>:VOLTage?`.
  - DM800 refiner: parse `*OPT?` to distinguish DM858 vs DM858E feature gating.
- [ ] **Shared helpers** moved to `drivers/rigol/_shared/` (parseBool, couplings, preamble parser, protection encoders, math operator map). Extracting now — while there is one caller — prevents copy-paste in 4.6–4.8.
- [ ] **Tests** iterate each variant table and assert: registry resolves the mock IDN → correct `DriverEntry.id` → constructed driver advertises the expected profile values (`channels`, `bandwidthMhz`, `voltageMax[1]`, `supportedModes`, …). Integration test uses the 4.1 simulator with hot-swapped `*IDN?` so all variants run against one process.
- [ ] **No behavior change on real hardware** — DHO804 / DP932E / DM858 continue to behave exactly as they do today (verified by the existing integration paths from 2.5 / 2.6 / 2.7 — re-run against the 4.1 simulator personality of each).
- [ ] **LXI identification document** fetch stays out of scope for this step — `*IDN?` + `*OPT?` cover what we need for profile resolution. Fetching `/lxi/identification` is a candidate for a later enhancement (hostname / device-class display on the overview card) and is **not** required here.
- [ ] **Docs**: step doc records the variant matrix, the refinement contract, and the "catch-all profile" fallback behavior. A contributor-facing note cross-linked from 4.9 describes how to add a new variant.

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
