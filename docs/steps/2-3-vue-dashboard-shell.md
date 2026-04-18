# 2.3 — Vue dashboard shell

## Goal

Deliver the card-grid dashboard, theme, and connect flow.

## Acceptance criteria

- [x] Header with app title, a live/offline WS badge, and a labeled light/dark toggle (persisted in `localStorage`, initial from `prefers-color-scheme`).
- [x] Main view at `/` is a responsive grid of device cards keyed by `sessionId` with an empty-state card when none are connected.
- [x] Each card shows: Lucide kind icon, short `*IDN?` title, `host:port`, status dot + text label, Disconnect, Open (link to `/device/:sessionId`).
- [x] "Add device" opens an accessible dialog (`aria-modal`, focus trap, Escape closes); fields: `Host`, `Port` (default 5025), Connect.
- [x] Status updates arrive via WebSocket (`sessions:init/update/removed`) and flow through Pinia.
- [x] All interactive elements keyboard-accessible; focus rings use the accent color; `prefers-reduced-motion` honoured in the base stylesheet.
