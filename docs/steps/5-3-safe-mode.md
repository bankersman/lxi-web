# 5.3 — Safe mode: read-only lockout

## Goal

A global client-side toggle that makes every write-capable control in the
UI behave as read-only, so the operator can show the dashboard to someone
(a classroom, a lab visitor, a recorded demo) without worrying about a
stray click flipping a PSU output on or misconfiguring a scope trigger.

Explicitly **not** an authentication layer. Not a permission system. Not
a server-side enforcement mechanism. The instruments themselves are
unauthenticated on the LAN; anyone with the TCP port can still send
SCPI. Safe mode is purely an ergonomic guard against accidents in the
dashboard UI.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 5 (bench safety).
- Related:
  - [2-3-vue-dashboard-shell.md](2-3-vue-dashboard-shell.md) — dashboard header where the toggle lives.
  - [3-4-device-detail-ux.md](3-4-device-detail-ux.md) — detail-page write controls.
  - [5-1-scpi-observability.md](5-1-scpi-observability.md) — transcript shows that safe mode stops writes at the UI.
  - [5-2-panic-stop.md](5-2-panic-stop.md) — panic remains available regardless of safe-mode state.

## Scope

### State

- Pinia store `useSafeMode` with a single reactive boolean `enabled`.
- Persisted to `localStorage` under `lxi-web.safeMode.v1`. Default =
  `false` (opt-in).
- No server-side coupling. If the user wants enforcement, that's outside
  this project's threat model.

### Gating

A small composable `useSafeModeGate` that returns:

```ts
function useSafeModeGate(): {
  readonly enabled: Ref<boolean>;
  /** Apply to buttons / inputs that mutate instrument state. */
  readonly attrs: ComputedRef<{
    disabled: boolean;
    "aria-disabled": boolean;
    title: string;
  }>;
};
```

- Every write-capable control on every detail page binds `v-bind="attrs"`.
- The `title` / `aria-describedby` tooltip reads
  **"Safe mode — unlock in the header"**.
- Controls that are *only* read-only by nature (waveform viewer, live
  readouts, transcript, error pill) are unaffected.

### Raw SCPI

- The Raw SCPI panel is split into two form submissions: **Query** and
  **Write**. Query stays enabled. Write is gated by safe mode. This is
  the only place where the distinction matters because both paths
  otherwise feel identical.
- Document this explicitly on the raw-SCPI help text so users don't
  wonder why `*RST` was silently refused.

### Panic exempt

- The panic button (5.2) is **always** clickable regardless of safe
  mode. A safety feature that locks itself out during an emergency is
  the wrong shape.

### UI

- Header toggle labelled **Safe mode** with an explicit On / Off state
  (never icon-only), following the 2.3 accessibility rules.
- When enabled, an ambient visual indicator: subtle top-border stripe
  across the whole app in the accent warning colour + a persistent
  breadcrumb-adjacent badge **"Safe mode — writes disabled"**.
  Respects `prefers-reduced-motion` (no pulsing / animation).
- First-time enable flow: small inline help describing what the mode
  does and what it doesn't do (one paragraph, no modal).
- Keyboard shortcut via 6.1: `g s` toggles safe mode.

## Acceptance criteria

- [ ] `useSafeMode` Pinia store persisted to `localStorage` with a
      versioned key; default `false`.
- [ ] `useSafeModeGate` composable applied to every write-capable
      control on every detail page (PSU / DMM / scope / e-load / SG /
      SA / raw SCPI Write).
- [ ] Disabled controls carry `disabled`, `aria-disabled="true"`, and a
      descriptive tooltip.
- [ ] Raw SCPI Query stays functional when safe mode is on.
- [ ] Panic button ignores safe mode entirely; test asserts it remains
      clickable with safe mode `true`.
- [ ] Ambient indicator (border stripe + badge) renders without layout
      shift when toggled.
- [ ] Dashboard card mini-controls (PSU output toggle, scope
      single-capture) inherit the gate.
- [ ] No server-side enforcement added or implied. The server still
      accepts writes from scripting clients and curl — documented on
      the docs page.
- [ ] Per-kind unit test walks every detail page and asserts write
      controls are disabled when `enabled === true`.
- [ ] User docs gain a short section explaining what safe mode is and
      is not.

## Notes

- Dashboard card mini-controls are a common miss — easy to gate
  detail-page buttons and forget the dashboard quick-toggles. The
  per-kind unit test must cover both.
- Safe mode is **not** the same as "disconnect the backend". A common
  temptation is to make it tear down sessions too; don't — losing the
  live readouts during a demo is exactly what the user is trying to
  avoid.
- This step is genuinely small. Resist the temptation to grow it into a
  role system or audit log. If that ever becomes a real requirement,
  it's a new epic with a threat model.
- The Safe-mode indicator and the panic button coexist — when both are
  visible, layout must not fight between them. Reserve header slots
  explicitly.
