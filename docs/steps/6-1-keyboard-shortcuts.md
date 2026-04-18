# 6.1 — Keyboard shortcuts and help overlay

## Goal

Make the dashboard **keyboard-first** where it counts. The 2.3
accessibility rules already mandate full keyboard navigation for every
flow, but there are no opinionated shortcuts for the handful of things
an operator does constantly: trigger a scope capture, flip a PSU
output, jump between sessions, open raw SCPI, fire panic stop. Land a
small, discoverable shortcut layer with a `?` help overlay and a
single registration point, so new detail pages and future kinds can
declare their shortcuts in one place without wiring DOM listeners
everywhere.

## Links

- Plan: [PLAN.md](../../PLAN.md) — Epic 6 (UX pass).
- Related:
  - [2-3-vue-dashboard-shell.md](2-3-vue-dashboard-shell.md) — header + router setup.
  - [2-4-per-session-detail-views.md](2-4-per-session-detail-views.md) — kind-specific detail pages that will register kind-scoped shortcuts.
  - [5-2-panic-stop.md](5-2-panic-stop.md) — `Ctrl+Shift+.` for panic stop.
  - [5-3-safe-mode.md](5-3-safe-mode.md) — `g s` for safe-mode toggle.

## Scope

### Registration API

New Pinia-adjacent module `useShortcuts` with a single registration
primitive:

```ts
interface ShortcutBinding {
  /** Chord (`"Ctrl+Shift+."`) or sequence (`"g d"`). */
  keys: string;
  label: string;
  scope: "global" | "dashboard" | "device" | `device:${DeviceKind}`;
  category: "navigation" | "action" | "safety" | "misc";
  handler: (ctx: ShortcutContext) => void | Promise<void>;
  /** Hidden from `?` help overlay when false; default true. */
  discoverable?: boolean;
}
```

Components call `registerShortcut(binding)` in `setup()` and
`unregisterShortcut(binding.keys)` in `onBeforeUnmount`. A tiny
`useShortcutsAutoCleanup` composable wraps the register/unregister
pair so nobody forgets teardown.

### Initial bindings (v1)

Global:

- `?` — open help overlay.
- `Esc` — close dialog / drawer / overlay (owned by whichever layer is on top).
- `/` — focus global search / filter.
- `g d` — go to dashboard.
- `g s` — toggle safe mode (from 5.3).
- `Ctrl+Shift+.` — panic stop (from 5.2; bypasses first-click confirm).

Dashboard:

- `j` / `k` — next / previous device card.
- `Enter` — expand focused card to detail.
- `a` — open Add-device dialog.
- `r` — reopen saved connections.

Device detail — kind-scoped:

- Scope (`device:oscilloscope`): `Space` single-capture, `R` run/stop,
  `1`..`4` toggle channel enable.
- PSU (`device:powerSupply`): `O` toggle output on focused channel,
  `T` focus channel tab.
- DMM (`device:multimeter`): `M` cycle mode, `L` start/stop trend log.
- E-load (`device:electronicLoad`): `I` toggle input enable, `M` cycle
  mode.
- SG (`device:signalGenerator`): `O` toggle focused channel output,
  `W` cycle waveform type.
- SA (`device:spectrumAnalyzer`): `Space` single sweep, `P` peak
  search.

All kind-scoped bindings are **documented** in the per-kind user manual
pages (under an existing "Shortcuts" section added in this step).

### Help overlay

- Triggered by `?` or a header `Shortcuts` button (labelled, not
  icon-only).
- Modal dialog with focus trap and `aria-modal` (matches 2.3 dialog
  rules).
- Grouped by `category`, filtered to the currently-active scope
  (global + current-route scope).
- Each row shows `keys`, `label`, and scope tag. Search bar at top
  filters labels.
- Close with `Esc` or a `Close` button.
- Respects `prefers-reduced-motion` for the open/close animation.

### Conflict and input rules

- Bindings are **disabled when a text input / textarea / contenteditable
  has focus**, except for explicit ``modifierRequired: true`` chords
  (`Ctrl+…`, `Meta+…`). This keeps `j` / `k` etc. from hijacking typing.
- Chord collisions across scopes are allowed only if scopes are
  disjoint (global vs a specific device kind). Overlapping bindings
  raise a runtime warning in dev mode.
- Sequences (`g d`) use a 1 s window; mistimed sequences clear state
  silently.

### Respect platform convention

- Swap `Ctrl` → `Cmd` / `Meta` on macOS for documented chords; detect
  once via `navigator.platform` and render the right glyph in the help
  overlay.

## Acceptance criteria

- [ ] `useShortcuts` module with register / unregister / help-overlay
      query surface; unit-tested for chord parsing, sequence detection,
      and input-focus suppression.
- [ ] `?` opens help overlay, `Esc` closes it; overlay is keyboard-only
      usable, traps focus, and groups bindings by category + scope.
- [ ] All v1 bindings above registered against the correct scopes and
      documented in the help overlay.
- [ ] Scope-based visibility: dashboard bindings don't show on detail
      pages, and vice versa; kind-scoped bindings show only on the
      matching kind.
- [ ] Chord conflict detection raises a dev-mode warning when two
      bindings in overlapping scopes collide.
- [ ] macOS `Ctrl` ↔ `Cmd` swap correctly rendered in the help overlay
      and correctly matched at runtime.
- [ ] Per-kind user manual pages gain a "Shortcuts" section listing
      the relevant bindings.
- [ ] Accessibility: overlay passes axe-core with no violations; every
      shortcut has a visible label (no icon-only surfaces).
- [ ] Safe-mode composable `useSafeModeGate` is consulted for bindings
      with `category: "action"` on write paths — they no-op silently
      with a brief toast "Safe mode — writes disabled".

## Notes

- Keep the initial binding set small. Every added chord is a thing
  someone has to learn and a thing that can collide with somebody's
  OS-level shortcuts. When in doubt, leave it out.
- The `g X` sequence idiom (`g d`, `g s`) is Gmail-adjacent — muscle
  memory for power users and invisible to everyone else. Resist the
  temptation to invent novel patterns.
- When a detail page is scrollable, `j` / `k` must not fight native
  scroll; document this and reserve `j`/`k` for explicit navigation
  only on the dashboard grid. Scope `j`/`k` to `scope: "dashboard"`
  exclusively.
- Shortcuts must never bypass panic-stop confirm if the user has opted
  back into the first-click confirm setting from 5.2; the shortcut
  handler calls the same code path as the header button, so this
  behaviour is automatic.
