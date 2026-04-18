# Adding a driver

This guide covers the three paths for growing the
[supported-hardware matrix](../user/supported-hardware.md):

1. **Add a variant** to an existing family (same vendor, same SCPI
   dialect, different SKU).
2. **Add a family** under an existing vendor (new SCPI dialect inside
   a kind lxi-web already knows about).
3. **Add a kind** entirely (network analyzer, SMU, frequency counter,
   …). This one triggers an epic-sized workflow — the first three
   new-kind steps in Epic 4 (electronic load, signal generator,
   spectrum analyzer) are the worked examples.

Before writing any code, **skim
[docs/steps/4-2-driver-family-profiles.md](../steps/4-2-driver-family-profiles.md)**
for the profile / variant / registry pattern. All vendor packs use
the same shape; understanding Rigol's DHO800 / DP900 / DM800 trio is
the fastest path in.

## Where things live

```
packages/core/src/
  facades/              # IOscilloscope, IPowerSupply, IMultimeter, ...
  identity/registry.ts  # DriverEntry + DriverRegistry
  drivers/
    <vendor>/
      _shared/          # parseBool, queryOptList, etc.
      <family>-profile.ts   # XxxProfile + VARIANTS table + refineXxxProfile
      <family>.ts           # The driver class
      index.ts              # registerXxxDrivers() wires everything up
packages/sim/personalities/
  <vendor>/
    <sku>.ts                # SimulatorPersonality for one SKU
    <sku>.fixture.json      # Optional — only for personalities that load fixtures
```

Tests live at `packages/core/test/<vendor>-profiles.test.ts` and
`packages/sim/test/integration.test.ts` (for end-to-end driver ⇄
simulator round-trips).

## Path 1 — Add a variant to an existing family

This is the common case. You own an SKU that sits under the same
SCPI dialect as an instrument that already works.

1. **Check the matrix.** If your SKU is already listed as `Preview`,
   file a [hardware report](../user/hardware-reports.md) instead — you
   are not adding a driver, you are bumping a status.
2. **Pick the profile file** (`<vendor>/<family>-profile.ts`) and add a
   row to the `VARIANTS` table. Copy the closest sibling and tweak the
   numbers: channel count, bandwidth, max V / I / W, supported modes,
   preset-slot count.
3. **If the registry uses per-variant entries** (look at
   `packages/core/src/drivers/siglent/index.ts` for the standard
   shape — `sortedByLength` + per-variant `register({...})`), add your
   variant's entry too. If the registry uses a single catch-all regex
   for the family (`rigol-dho800`, `rigol-dg900`), you are usually
   done — the catch-all resolves your SKU via the variant table.
4. **Add a simulator personality.** Copy the closest sibling
   personality under `packages/sim/personalities/<vendor>/`, swap the
   IDN string and any SKU-specific defaults, and register it in
   `packages/sim/personalities/index.ts`. If the shared factory for
   your family (e.g. `packages/sim/personalities/owon/_shared/xdm.ts`)
   covers your variant, you only need the thin wrapper file.
5. **Write one registry test** in
   `packages/core/test/<vendor>-profiles.test.ts` asserting that
   `registry.resolve(parseIdn("VENDOR,<YOUR_SKU>,SN,FW"))` returns
   the right `entry.id` and variant profile.
6. **Write one integration test** in
   `packages/sim/test/integration.test.ts` that calls one capability
   you care about end-to-end (e.g. `setChannelVoltage` + read back).
7. **Update the matrix.** Add a row to
   `docs/user/supported-hardware.md` as `Preview` and move on.

Typical diff size: ~30 lines of code + 20 lines of tests + 2 matrix
rows. If your diff is significantly larger, you are probably
actually on Path 2 — stop and re-read the next section.

## Path 2 — Add a family under an existing vendor

A new family is a new SCPI dialect — different command tree from the
instrument's siblings. Rigol MSO5000 vs DHO800 is the canonical
example: same vendor, same device kind (oscilloscope), completely
different programming guide.

1. **Confirm it is a new family.** If the only thing that differs
   from an existing family is a couple of model numbers and a
   bandwidth ceiling, that's Path 1 with a widened regex, not a new
   family.
2. **Add a profile file** (`<vendor>/<newfamily>-profile.ts`) with:
   - `<NewFamily>Profile` interface (follow a sibling family for shape).
   - `<NEWFAMILY>_VARIANTS: readonly <NewFamily>Profile[]` table.
   - `<NEWFAMILY>_DEFAULT: <NewFamily>Profile` for the catch-all.
   - `refine<NewFamily>Profile(base, port): Promise<<NewFamily>Profile>`
     — tolerant of `*OPT?` being unsupported (return `base` unchanged
     rather than throwing).
3. **Add the driver class** (`<vendor>/<newfamily>.ts`) implementing
   the relevant facade (`IOscilloscope`, `IPowerSupply`, …). Reuse
   the vendor's `_shared/` helpers — if they don't exist yet, create
   them in `_shared/` rather than inlining shared parsing.
4. **Register in `<vendor>/index.ts`** — add the per-variant +
   catch-all entries, list them longest-name-first if you have
   overlapping prefixes (`SPD3303X-E` before `SPD3303X`).
5. **Add at least one simulator personality** per family. A single
   personality is enough to validate the registry + the driver round
   trip; other variants get Preview rows without personalities.
6. **Write a full test suite:**
   `packages/core/test/<vendor>-profiles.test.ts` covering registry
   resolution + refinement + manufacturer pattern tolerance, plus
   one or more integration tests for the simulator personality
   against the driver class.
7. **Add the family's rows to the matrix** as `Preview`.

Worked examples:

- Siglent SDS HD scope family — adds a new 12-bit `hd-scpi2000`
  dialect alongside the legacy `1000x-e` tree.
- Keysight InfiniiVision scope family — lives under the same vendor
  as the E36 PSU family but has nothing in common SCPI-wise.
- Owon XDS scope family — deliberately minimal surface because the
  firmware only implements a reduced SCPI subset.

## Path 3 — Add a whole new kind

Network analyzers, SMUs, frequency counters, switch matrices — all
backlog items. A new kind means a new facade type, new UI panels, new
REST routes, and probably a shared capability object.

1. **Propose the kind first** via an issue referencing
   [PLAN.md](../../PLAN.md) — the maintainer will scope an Epic-level
   step the way Epic 4.3 / 4.4 / 4.5 were scoped.
2. Once scoped, the work breaks into the same sub-steps you'll see in
   any Epic 4.x step: facade + capability objects, a reference driver
   + simulator personality, server routes, Vue panels, a user-manual
   page, and matrix entries. Path 2 handles the driver layer once the
   facade exists.

You should **not** try to add a new kind as a drive-by. The facade
design deserves review before any driver commits to it.

## Hardware reports are the fast path

If you own the hardware but aren't comfortable with the driver stack,
**please file a [hardware report](../user/hardware-reports.md) anyway**.
A report with a full `*IDN?` / `*OPT?` / SCPI capture is sometimes
enough to close a Path-1 variant-add without requiring the reporter to
write any code — the maintainer does the matrix diff and your SKU
lands as `Community` in a release.

## Checklist before opening a PR

- [ ] New variant / family rows appear in
  `docs/user/supported-hardware.md` with `Preview` status.
- [ ] Registry test asserts correct driver resolution for at least
  one representative IDN per new SKU.
- [ ] Simulator personality registered in
  `packages/sim/personalities/index.ts` and appears in the roster
  assertion in `packages/sim/test/simulator.test.ts`.
- [ ] At least one integration test round-trips one capability
  end-to-end against the personality.
- [ ] `pnpm -r typecheck` and `pnpm -r test` both pass locally.
- [ ] `progress.md` is updated only if the change closes a step (not
  for individual variant-adds).
