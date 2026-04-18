# 2.7c — Scope save and replay (references, history, display, presets)

Parent: [2.7 — Scope advanced features](./2-7-scope-advanced-features.md).
Depends on: 2.7a (tab strip + acquisition state) and 2.6c (shared
`InstrumentPresetCapability`).

## Goal

Cover the "save what I just captured" and "show me what happened before"
surface: **reference waveforms** (10 slots on the DHO800), **history /
segmented frames** with a frame scrubber, **display screenshot** in
PNG / BMP / JPG, and **setup presets** reusing the shared preset
capability from 2.6c.

## Scope

### Facade additions (all optional)

```ts
export interface OscilloscopeReferenceCapability {
  readonly slots: number;                  // 10 on DHO800
  readonly supportsLabel: boolean;
}

export interface OscilloscopeReferenceSlot {
  readonly index: number;                  // 1-based
  readonly occupied: boolean;
  readonly label?: string;                 // present when supportsLabel
  readonly source?: string;                // "CHAN1" | "MATH" | …
  readonly visible: boolean;
}

export interface OscilloscopeHistoryCapability {
  readonly maxFrames: number;              // roughly — instrument-dependent
}

export interface OscilloscopeHistoryFrame {
  readonly index: number;                  // 1-based, oldest → newest
  readonly capturedAt: number;             // instrument wall-clock (ms) when known, else fetch time
}

export interface OscilloscopeDisplayCapability {
  readonly screenshotFormats: readonly ("png" | "bmp" | "jpg")[];
  readonly persistenceModes: readonly ("off" | "infinite" | "1s" | "5s" | "10s")[];
}

// Preset capability comes from the shared type introduced in 2.6c:
import type { InstrumentPresetCapability } from "../instruments.js";
```

Methods (all optional):

- References: `getReferenceSlots?(): Promise<readonly OscilloscopeReferenceSlot[]>`,
  `saveReference?(slot: number, source: string, label?: string): Promise<void>`,
  `showReference?(slot: number, visible: boolean): Promise<void>`,
  `clearReference?(slot: number): Promise<void>`,
  `readReferenceWaveform?(slot: number): Promise<Waveform>`.
- History: `enableHistory?(enabled: boolean): Promise<void>`,
  `getHistoryStatus?(): Promise<{ enabled: boolean; frames: readonly OscilloscopeHistoryFrame[]; currentFrame?: number }>`,
  `seekHistoryFrame?(index: number): Promise<void>`.
- Display: `screenshot?(format: "png" | "bmp" | "jpg"): Promise<Uint8Array>`,
  `getPersistence?(): Promise<DisplayPersistenceMode>`,
  `setPersistence?(mode: DisplayPersistenceMode): Promise<void>`.
- Presets: `getPresetCatalog?()`, `savePreset?(slot)`,
  `recallPreset?(slot)` — shared shape from 2.6c.

### REST surface

- `GET  /api/sessions/:id/scope/references` — capability + slot list.
- `POST /api/sessions/:id/scope/references/:slot/save` — body
  `{ source, label? }`.
- `POST /api/sessions/:id/scope/references/:slot/show` — body
  `{ visible }`.
- `POST /api/sessions/:id/scope/references/:slot/clear`.
- `GET  /api/sessions/:id/scope/references/:slot/waveform` — binary
  `Waveform` frame so the UI can overlay it on the hero uPlot.
- `POST /api/sessions/:id/scope/history` — body `{ enabled }`.
- `GET  /api/sessions/:id/scope/history` — status + frame list.
- `POST /api/sessions/:id/scope/history/seek` — body `{ index }`.
- `GET  /api/sessions/:id/scope/screenshot?format=png|bmp|jpg` —
  binary download with correct `Content-Type`.
- `GET  /api/sessions/:id/scope/display` / `POST …/display` — persistence.
- `GET  /api/sessions/:id/scope/presets` / save / recall — matches 2.5
  and 2.6c.

Validation: slot out of range → 400; unsupported format → 400; seek
beyond frame count → 400; capability missing → 409.

### UI additions on the scope detail page

Three new tabs on the side column:

- **Refs** tab
  - 10-slot grid (2×5). Each slot card shows Source label, a tiny
    waveform thumbnail rendered from the cached reference waveform, and
    Save / Show / Hide / Clear buttons.
  - Save dialog asks for an optional label when `supportsLabel` is
    true; visible references overlay on the hero uPlot with a distinct
    color per slot.
- **History** tab
  - Enable toggle; when on, a horizontal scrubber spans frames 1 → N
    with a frame counter.
  - Play / Pause buttons for timed playback (1 fps default,
    configurable), plus ← / → step buttons and a numeric frame-jump
    input.
  - Selecting a frame seeks the instrument and reloads the hero uPlot
    with that frame's waveform.
- **Display & Presets** tab
  - Screenshot row — format drop-down (filtered to
    `screenshotFormats`) and a **Download screenshot** button that
    triggers the REST endpoint and saves the returned binary.
  - Persistence selector (Off / Infinite / 1 s / 5 s / 10 s).
  - Preset grid (same component as 2.6c / 2.5), 10 slots on the
    DHO800.

## Acceptance criteria

- [ ] `IOscilloscope` gains optional `references`, `history`,
      `display`, and `presets` capabilities (presets via the shared
      `InstrumentPresetCapability` from 2.6c) plus the methods above.
- [ ] `RigolDho800` advertises `references` with 10 slots (and labels
      if `:REFerence:LABel` is supported), `history` with the DHO800's
      practical frame count, `display` with its advertised screenshot
      formats and persistence modes, and `presets` with its `*SAV`
      slot count.
- [ ] REST endpoints validate inputs, stream the screenshot binary
      with the correct `Content-Type`, and serve the reference
      waveform in the same format as a channel waveform.
- [ ] UI Refs grid overlays visible references on the hero uPlot with
      a distinct color per slot; hidden references stay cached (no
      re-fetch on Show); Clear prompts confirmation when the slot is
      populated.
- [ ] History tab's scrubber stays keyboard-accessible (arrow keys
      step one frame, Home / End jump to ends); Play respects
      `prefers-reduced-motion` (pauses default playback).
- [ ] Screenshot download names the file with the session's IDN short
      title + timestamp so successive downloads don't collide.
- [ ] Preset grid overwrite prompts confirmation (same contract as
      2.5 / 2.6c); Recall is disabled for empty slots.
- [ ] Unit tests cover reference save / show / clear / waveform read,
      history enable / seek, screenshot binary framing for each
      format, persistence round-trip, and preset save / recall.
- [ ] Integration tests cover `/scope/references/*`, `/scope/history/*`,
      `/scope/screenshot`, `/scope/display`, and `/scope/presets/*` —
      capability gating, input validation, and SCPI side-effects.

## Notes

- The shared `InstrumentPresetCapability` must already be in
  `@lxi-web/core` from 2.6c — if 2.6c has not landed yet, 2.7c's first
  commit introduces the shared type and 2.6c becomes its second
  consumer. The landing order is not enforced.
- History frames are navigated by index, not by timestamp, because
  timestamp accuracy depends on the scope's clock discipline. The
  `capturedAt` field is best-effort and clearly documented as such.
- Screenshot is explicitly a binary download route — no base64,
  no Data URI, because browsers handle a plain download link better
  for large BMPs.
