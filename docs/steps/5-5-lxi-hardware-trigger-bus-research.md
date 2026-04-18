# 5.5 — LXI hardware trigger bus (research spike)

## Goal

Decide whether to ever pursue **hardware-synchronous** triggering across
instruments, and document the state of play so a future contributor with
capable gear can pick it up without re-starting research from scratch.

This step is **mostly a document** and does not necessarily ship code on
the v1 target hardware (Rigol DHO804 / DP932E / DM858).

## Background — what the LXI standard actually offers

Historically LXI split instruments into three classes; since LXI 1.4 these
are reframed as **Extended Functions**:

1. **LXI Core** (formerly Class C) — the baseline LAN instrument. This is
   what every current v1 target is. No hardware sync.
2. **LXI Timestamped Data / IEEE 1588 PTP** (formerly Class B) — synchronize
   clocks across instruments over LAN using IEEE 1588-2008 Precision Time
   Protocol. Enables time-tagged samples aligned to sub-microsecond.
3. **LXI Wired Trigger Bus** (formerly Class A) — a physical 8-line trigger
   bus (typically SMB connectors on a dedicated TRIG input/output block)
   so one device's trigger fires another in hardware.

On top of that, VXI-11 (RPC over TCP, port 111/1024-range) defines a
`device_trigger` call which is the closest thing to a "LAN group execute
trigger". Raw-SCPI (port 5025, which this project uses) doesn't have
`device_trigger`, but every IEEE 488.2 instrument accepts `*TRG`, and most
kinds also accept `:TRIGger[:SEQuence][:IMMediate]`.

## Target hardware reality check

Per their programming guides and datasheets:

| Instrument      | LXI class  | PTP | Wired trigger bus | Front-panel EXT TRIG |
| --------------- | ---------- | --- | ----------------- | -------------------- |
| Rigol DHO804    | Core only  | no  | no                | yes (BNC)            |
| Rigol DP932E    | Core only  | no  | no                | no                   |
| Rigol DM858     | Core only  | no  | no                | yes (rear)           |

So the wired bus is not an option for this project's hardware; software
triggering is the realistic path. Research should still land so the day a
Keysight or R&S box shows up, the capability is a well-understood plug-in.

## Spike deliverables

### Research notes (required)

- Short write-up on each extended function with citations to the LXI spec
  (currently LXI 1.6) and relevant IVI Foundation material.
- Summary of how PTP works on a local bench network: boundary clocks,
  grandmaster election, typical jitter, required switch support.
- Catalogue of vendor commands used to arm-and-fire across multiple
  instruments over SCPI (not hardware): `*TRG`, `:TRIGger:IMMediate`,
  per-vendor equivalents.
- Rough benchmark plan: how to measure software-trigger jitter between
  two devices on the same LAN (sequential socket writes vs. a tight
  `Promise.all` batch, with caveats about Nagle and TCP_NODELAY).

### Optional code spike (stretch)

- `common.triggerBroadcast` action: takes an array of `sessionId`s and
  issues `*TRG` to each back-to-back with `TCP_NODELAY` already set by
  `TcpTransport`. Emit a single `triggerBroadcast` event on the 5.1 bus
  with per-session dispatch timestamps so jitter is visible in the 5.4
  timeline.
- This is **not** a substitute for a hardware bus; document measured
  jitter in the notes and label the action accordingly in the UI.

### Future-gated work (not in this step)

- `IPtpClock` capability on the façade layer, mirroring 2.5's optional
  capability pattern, so PTP-capable instruments can expose
  `getPtpStatus()` / `setPtpEnabled()` without forcing anything on
  Core-only gear.
- `ITriggerBus` capability for wired-bus-capable instruments, with line
  assignment and direction.
- A backend timestamp-alignment layer that prefers PTP when available
  and falls back to wall-clock + sequence `seq` from 5.1.

## Acceptance criteria

- [ ] `docs/steps/5-5-lxi-hardware-trigger-bus-research.md` contains the
      research notes, hardware table, and decision recommendation (ship
      the software broadcast spike or defer entirely).
- [ ] If the optional spike lands, it lives behind a feature flag, adds
      the `common.triggerBroadcast` action, and documents measured jitter.
- [ ] Future `IPtpClock` / `ITriggerBus` capability shapes are sketched
      (interface only, no implementation) and linked from the facades
      documentation so later work has a starting point.
- [ ] Decision and scope are reflected back in `PLAN.md` (Version 2
      backlog) and `progress.md`.

## Notes

- PTP without switch support is practically useless; most lab switches
  either transparently pass PTP (best case) or eat it (worst case). Any
  future PTP work should include a "check your switch" pre-flight.
- Near-simultaneous SCPI `*TRG` over TCP_NODELAY on a quiet LAN gets to
  low-single-digit-millisecond jitter in practice — plenty for most
  bench workflows, not a substitute for wired sync.
- Nothing in this step should block 5.1–5.4 from shipping.
