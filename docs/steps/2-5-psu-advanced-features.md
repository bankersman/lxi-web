# 2.5 — PSU advanced features

## Goal

Expose vendor-specific advanced capabilities on the PSU detail page as
optional facade capabilities so non-supporting drivers stay unaffected and the
UI gracefully hides what a device cannot do.

Covered in this step:

1. **Channel coupling** — internal series / parallel wiring of CH1+CH2.
2. **Over-voltage / over-current protection (OVP / OCP)** — per-channel
   enable, threshold, live trip status, and clear-trip action.
3. **Tracking** — CH2 mirrors CH1 set-points via `:OUTPut:TRACk`.
4. **Preset memory** — `*SAV` / `*RCL` for saving and recalling the full
   instrument state across 10 slots.

## Scope

### Capabilities on `IPowerSupply`

All new additions are optional so older drivers keep working unchanged:

- `pairing?: PsuPairingCapability` + `getPairingMode?()` / `setPairingMode?()`
- `protection?: PsuProtectionCapability` + `getProtection?()`,
  `setProtectionEnabled?()`, `setProtectionLevel?()`, `clearProtectionTrip?()`
- `tracking?: PsuTrackingCapability` + `getTracking?()` / `setTracking?()`
- `presets?: PsuPresetCapability` + `getPresetCatalog?()`, `savePreset?()`,
  `recallPreset?()`

### Rigol DP900 driver (DP932E tested)

Backed by the DP900 programming guide:

| Feature    | SCPI                                                            |
| ---------- | --------------------------------------------------------------- |
| Pairing    | `:OUTPut:PAIR? / :OUTPut:PAIR OFF\|SERies\|PARallel`            |
| OVP state  | `:OUTPut:OVP? CHn / :OUTPut:OVP CHn,ON\|OFF`                    |
| OVP level  | `:OUTPut:OVP:VALue? CHn / :OUTPut:OVP:VALue CHn,<v>`            |
| OVP trip   | `:OUTPut:OVP:QUES? CHn` / `:OUTPut:OVP:CLEar CHn`               |
| OCP        | `:OUTPut:OCP:*` — same shape as OVP with `A` units              |
| Tracking   | `:OUTPut:TRACk? / :OUTPut:TRACk ON\|OFF`                        |
| Presets    | `*SAV n` / `*RCL n` plus `:MEMory:VALid? RIGOLn.RSF` for status |

Ranges from table 4.33 of the programming guide:

- CH1 / CH2: OVP 1 mV–33 V, OCP 1 mA–3.3 A
- CH3: OVP 1 mV–6.6 V, OCP 1 mA–3.3 A

### REST surface

- `GET  /api/sessions/:id/psu/pairing`
- `POST /api/sessions/:id/psu/pairing`
- `GET  /api/sessions/:id/psu/tracking`
- `POST /api/sessions/:id/psu/tracking`
- `GET  /api/sessions/:id/psu/channels/:channel/protection` — returns `{ channel, ovp, ocp }`
- `POST /api/sessions/:id/psu/channels/:channel/protection/:kind` — `kind` = `ovp` | `ocp`, body `{ enabled?, level? }`
- `POST /api/sessions/:id/psu/channels/:channel/protection/:kind/clear`
- `GET  /api/sessions/:id/psu/presets` — returns `{ supported, slots, occupied }`
- `POST /api/sessions/:id/psu/presets/:slot/save`
- `POST /api/sessions/:id/psu/presets/:slot/recall`

Unsupported devices return `supported: false` on GET and `409` on POST.
Level / slot validation returns `400` with an `error` string.

### UI

- Top of the PSU detail page stacks three capability cards (each hidden when
  its `supported === false`):
  - `PsuPairingControl` — Independent / Series / Parallel radio group with a
    confirm-before-apply dialog. Unchanged from the previous iteration.
  - `PsuTrackingControl` — a single toggle switch with a short explanation of
    what tracking mirrors between CH1 and CH2.
  - `PsuPresetsControl` — 2×5 grid of preset slots. Each slot shows a
    Saved/Empty badge and Save / Recall buttons. Overwriting a populated slot
    prompts for confirmation; Recall is disabled for empty slots.
- Every channel card contains a collapsible **Protection** `<details>` panel
  (`PsuProtectionControl`) summarising OVP and OCP status in the closed state
  (`OVP: Arm @ 8.800 V · OCP: Tripped`, etc). When open it exposes per-kind:
  - Enable / disable switch.
  - Numeric level input clamped to the driver-advertised range.
  - Inline error text for bad inputs or remote errors.
  - A red "Clear" action that only appears while the protection is tripped,
    and the card gets a red ring to draw attention.
- Any external change that may invalidate channel/protection state (pairing
  toggle, preset recall, tracking change) bumps a `refreshKey` that forces
  each protection panel to re-fetch without waiting for its next tick.
- Steady-state `PsuChannelState[]` updates flow through the WebSocket topic
  `psu.channels` via `useLiveReading` — see
  [2-2 § Live reading subscriptions](./2-2-rest-and-websocket.md#live-reading-subscriptions).
  The REST `GET /api/sessions/:id/psu/channels` endpoint stays in place and
  is used for the snappy post-write refresh after Apply / Output toggle /
  preset recall.
- Tracking state and per-channel OVP/OCP status are pushed the same way on
  topics `psu.tracking` and `psu.protection`. The protection topic emits a
  single snapshot containing every supported channel, so the per-channel
  `<PsuProtectionControl>` cards all share one device poll regardless of
  channel count. The REST endpoints (`GET /psu/tracking`,
  `GET /psu/channels/:channel/protection`) are still used for the one-shot
  refresh fired after a user write (toggle, Set, preset recall, pairing
  change).

## Acceptance criteria

- [x] `IPowerSupply` gains optional `pairing`, `protection`, `tracking`, and
      `presets` capabilities plus matching optional methods. Non-supporting
      drivers are unaffected.
- [x] `RigolDp900` advertises all four capabilities with ranges drawn from
      the DP900 programming guide, and round-trips each SCPI family tested
      against the manual.
- [x] REST endpoints return a capability descriptor on GET, validate bodies
      (400 for bad inputs, 409 for unsupported), and forward to the driver.
- [x] PSU detail page hides each control cleanly when unsupported; coupling,
      tracking, and presets live above the channel grid; per-channel OVP/OCP
      live inside each channel card as a collapsible section.
- [x] Tripped protections show a red ring and a visible **Clear** action;
      clear invokes `:OUTPut:O[V|C]P:CLEar CHn` and refreshes state.
- [x] Preset overwrite and pairing changes require explicit confirmation
      dialogs before applying.
- [x] Unit tests cover the driver SCPI for each new capability (OVP/OCP,
      tracking, presets — including range and slot validation).
- [x] Integration tests cover the new REST routes — capability advertising,
      input validation, and SCPI side-effects (`:OUTPut:OVP:VALue`, `*SAV`,
      `*RCL`, `:OUTPut:TRACk`).

## Follow-ups (deferred)

- Non-Rigol PSU drivers (Siglent, Rohde & Schwarz) once v2 device kinds land.
- Auto-discovery of LXI instruments on the local network (backlog item).
- Arbitrary-waveform scheduling on DP900 with the `DP900-ARB` option.
- Advanced OVP/OCP delay programming (`:OUTPut:OCP:DELay`).
