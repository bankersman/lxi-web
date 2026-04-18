# 2.1 — Multi-session backend

## Goal

A session manager that holds one SCPI session per instrument and lets the API and WebSocket layer key operations by `sessionId`.

## Acceptance criteria

- [x] `SessionManager.open({ host, port })` returns a stable `sessionId`, runs `*IDN?`, resolves the façade, and records connection state. _Returns synchronously in status `connecting` and transitions to `connected` or `error`._
- [x] `SessionManager.list()` returns all sessions with their kind, IDN, host:port, status.
- [x] `SessionManager.close(id)` disposes the transport and emits a `removed` event.
- [x] Lifecycle emits `update` and `removed` events so the WS layer can broadcast.
- [x] Optional max-sessions cap rejects with a clear error.
