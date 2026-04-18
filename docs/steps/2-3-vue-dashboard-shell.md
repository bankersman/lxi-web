# 2.3 — Vue dashboard shell

## Goal

Deliver the card-grid dashboard, theme, and connect flow.

## Acceptance criteria

- [ ] Header with app title, GitHub/help link (optional), and a labeled light/dark toggle (persisted in `localStorage`, initial from `prefers-color-scheme`).
- [ ] Main view at `/` is a responsive grid of device cards keyed by `sessionId`.
- [ ] Each card shows: Lucide kind icon, short `*IDN?` title, `host:port`, status dot + text label, Disconnect, Open (link to `/device/:sessionId`).
- [ ] "Add device" opens an accessible dialog (`aria-modal`, focus trap); fields: `Host`, `Port` (default 5025), Connect.
- [ ] Status updates arrive via WebSocket and flow through Pinia.
- [ ] All interactive elements keyboard-accessible; focus rings visible.
