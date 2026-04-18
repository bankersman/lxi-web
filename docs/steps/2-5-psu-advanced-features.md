# 2.5 — PSU advanced features: channel coupling

## Goal

Expose vendor-specific advanced capabilities on the PSU detail page, starting
with series/parallel channel coupling for multi-channel supplies. Keep the
addition optional on the facade so non-pairing PSUs (future drivers) aren't
forced to implement it.

## Scope

- Advertise channel pairing as an optional capability on `IPowerSupply`.
- Implement pairing on the Rigol DP900 driver (DP932E-tested) using the
  `:OUTPut:PAIR` command family.
- Expose a REST endpoint that also tells the UI whether the feature is
  supported for this device.
- Add a coupling UI with a confirm-before-apply safety dialog, and reflect the
  paired state in the per-channel cards.

## Acceptance criteria

- [x] `IPowerSupply` gains `pairing?: PsuPairingCapability` plus optional
      `getPairingMode()` / `setPairingMode()` methods. Non-pairing drivers are
      unaffected and the UI hides the control when `supported === false`.
- [x] `RigolDp900` declares that CH1 + CH2 support `off | series | parallel`,
      reads state via `:OUTPut:PAIR?`, and writes via
      `:OUTPut:PAIR OFF|SERies|PARallel`. CH3 always stays independent.
- [x] `GET /api/sessions/:id/psu/pairing` returns
      `{ supported, modes, channels, mode }`. `POST` validates the body
      against the advertised modes (400 on invalid, 409 on unsupported).
- [x] PSU detail page renders a "Channel coupling" radio group
      (Independent / Series / Parallel) with per-mode hints and a confirm
      dialog that warns about wiring before applying.
- [x] Channel cards reflect pairing:
  - Both pair members show a "Series" / "Parallel" badge with the `Link2`
    icon so coupling is visible at a glance.
  - **Parallel** locks the follower (CH2): dimmed card, disabled output
    toggle and inputs, "Controlled via CH1" hint, and the master card shows
    the doubled-current combined limits.
  - **Series** leaves both channels fully editable — the user still sets
    each channel's voltage independently (the pair's combined output is
    CH1 + CH2 at the terminals). Limits remain each channel's native cap.
- [x] Unit test coverage: DP900 parses `:OUTPut:PAIR?` and emits the right
      `SERies / PARallel / OFF` arguments.
- [x] Integration test coverage: the `/psu/pairing` endpoint advertises the
      modes and rejects bogus payloads.

## Follow-ups (deferred to 2.6+)

- Over-voltage / over-current protection: per-channel enable, threshold, trip
  detection, and clear-trip action.
- Tracking function (`:OUTPut:TRACk`) — slave CH2's set values to CH1 without
  physically combining them.
- Preset memory slots (`*SAV` / `*RCL`) for saving and recalling full PSU
  state.
