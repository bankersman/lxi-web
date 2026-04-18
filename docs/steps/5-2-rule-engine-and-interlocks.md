# 5.2 — Rule engine with counters and safety interlocks

## Goal

Let the operator compose **when / then** automations across connected
instruments — "when DMM current &gt; 500 mA, disable PSU CH1", "every scope
trigger, bump a counter and log to the timeline" — reusing the event bus and
action catalog from 5.1.

Safety interlocks are **not** a separate mechanism; they are rules with
elevated priority and stricter ergonomics (confirm-to-disable, run-first).

## Scope

### Rule model

```ts
interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: "safety" | "normal";
  match: EventMatch;                 // { kind, sessionId?, channel?, predicate? }
  condition?: Predicate;             // typed expression over event + counters
  actions: ActionInvocation[];       // references into the 5.1 action catalog
  debounceMs?: number;
  cooldownMs?: number;
  counters?: CounterUpdate[];        // e.g. inc "scopeShots" by 1
}
```

`Predicate` is a small, typed expression tree (not arbitrary JS) so rules
stay inspectable, persist-able, and safe to evaluate in the backend. Initial
operators: comparison (`<`, `<=`, `==`, `>=`, `>`, between), logical
(`and`, `or`, `not`), and counter reference (`counter("name") > 10`).

### Counters

- Named, integer, per-rule-engine (not per-session) so multi-session rules
  can share a counter.
- Observable: each change emits a `counterChanged` event on the 5.1 bus so
  the UI can show live values without polling.
- Resettable from the UI; persisted with rules so restart keeps state.

### Safety priority

- Safety rules run **before** normal rules on the same event tick.
- Safety rules are guaranteed to fire even when no browser is connected (the
  backend alone is enough — this is deliberately different from 2.5's UI
  panels, which need the detail page open).
- Disabling a safety rule requires a two-step confirmation in the UI; normal
  rules disable with a single click.
- Safety actions default to idempotent ones (`psu.setOutput(false)`,
  `scope.stop`); the catalog marks each action with a `safeForInterlocks`
  flag so risky actions can't be stapled onto a safety rule by accident.

### Persistence and lifecycle

- Rules live in a JSON file next to the session state (single-user,
  single-deployment assumption from the plan).
- Backend reloads rules on startup and subscribes them to the event bus
  before accepting HTTP traffic, so interlocks are live the moment devices
  reconnect.
- Each rule fire writes a `ruleFired` event (id, trigger event id, actions
  invoked, result) for the 5.4 timeline.

### REST surface

- `GET /api/rules` — list rules and counter values.
- `POST /api/rules` / `PATCH /api/rules/:id` / `DELETE /api/rules/:id` —
  CRUD with schema validation.
- `POST /api/rules/:id/enabled` — body `{ enabled: boolean, confirm?: true }`
  (safety rules require `confirm: true` to disable).
- `POST /api/rules/counters/:name/reset` — explicit reset.
- `GET /api/rules/activity?limit=100` — recent fires (backed by the bus
  buffer from 5.1 until 5.4 gives it a real store).

### UI

- New **Rules** page linked from the header:
  - Two-column list — safety rules pinned on top with a shield badge.
  - Rule editor modal: select source event via drop-down, build condition
    with the typed predicate UI, pick one or more actions from catalogs
    filtered by target session.
  - Live activity log with the last N fires and their outcomes.
  - Counter bar: small strip of named counters with inline reset.
- Dashboard cards surface a tiny lightning-bolt badge when a safety rule is
  targeting that session, with a tooltip summarising which rule.

## Acceptance criteria

- [ ] Rule CRUD validates the predicate tree and action references against
      the 5.1 catalog (invalid action id → 400 with a clear error).
- [ ] Event bus subscription respects rule priority — safety rules fire
      before normal ones on the same event.
- [ ] Debounce and cooldown are enforced per rule (not globally) and tested
      against jittery event streams.
- [ ] Counters increment atomically, emit `counterChanged`, persist across
      restarts, and appear as usable references in predicates.
- [ ] Interlock disables require two-step confirmation in the UI and in the
      REST endpoint (missing `confirm: true` → 409).
- [ ] Safety rules fire with no browser connected — integration test spins
      the backend headless, feeds a threshold-crossing event, and asserts
      the PSU driver receives `:OUTP OFF`.
- [ ] Rule fires are recorded as `ruleFired` events on the bus so 5.4 can
      draw them on the timeline.

## Notes

- No arbitrary JavaScript in rules by design — this is a bench tool, not a
  scripting host. 5.3's sequences cover imperative needs.
- The predicate tree stays small on purpose; when something needs more
  expressiveness it should probably be a sequence, not a rule.
- Counters are intentionally global-per-engine rather than per-session so a
  "total shots this bench session" counter can span devices. Per-session
  counters can be expressed by scoping `match.sessionId`.
