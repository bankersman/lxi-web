# 2.1 — Multi-session backend

## Goal

A session manager that holds one SCPI session per instrument and lets the API and WebSocket layer key operations by `sessionId`.

## Acceptance criteria

- [ ] `SessionManager.open({ host, port })` returns a stable `sessionId`, runs `*IDN?`, resolves the façade, and records connection state.
- [ ] `SessionManager.list()` returns all sessions with their kind, IDN, host:port, status.
- [ ] `SessionManager.close(id)` disposes the transport and emits a disconnect event.
- [ ] Lifecycle emits events (`opened`, `closed`, `error`) so the WS layer can broadcast.
- [ ] Optional max-sessions cap rejects with a clear error.
