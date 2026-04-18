# Getting started

A 5-minute walk-through from a cold start to a working dashboard.

## 1. Open the dashboard

With the app running (see [Installation](./installation.md)), open the
web UI. The dashboard starts empty — a reminder card invites you to
**Add a device**.

## 2. Add your first device

Click **Add device**. The dialog offers three paths:

1. **Saved connections** — your browser-local address book. Empty on
   first launch.
2. **Scan the LAN** — a best-effort mDNS/DNS-SD sweep. If your
   instrument advertises itself (most modern Rigol / Keysight /
   Tektronix gear does), it shows up here.
3. **Enter host & port** — fallback that always works. The default
   SCPI-raw port is **5555** for Rigol; other vendors commonly use
   **5025**.

## 3. Identify the instrument

After connection the server sends `*IDN?` to the instrument. The
response is parsed into **vendor / model / serial / firmware** and the
device is routed to a typed panel (scope / PSU / DMM) or to the raw
SCPI console if we do not have a driver for it.

You can always see the raw `*IDN?` at the top of the device page; the
**Copy `*IDN?`** button puts it on the clipboard for bug reports.

## 4. Use the dashboard

- **Dashboard grid** — each connected instrument has a card with live
  readouts (trigger state, rail voltages, primary reading).
- **Device detail** — click a card to expand into the full panel. The
  first landmark is the overview card with quick actions: copy
  `*IDN?`, jump to raw SCPI, toggle auto-connect, disconnect.
- **Saved connections** — any successful connection is remembered on
  the browser side. Flip **Auto-connect on launch** to reopen it
  automatically next time the page loads.

## 5. Recover from drops

If an instrument disconnects (power cycle, LAN flap, firmware reboot)
the card turns red and a **Reconnect** button appears. The
`sessionId` stays stable across reconnects so URLs and WebSocket
subscriptions keep working.

## Next

- [Oscilloscope](./oscilloscope.md) — full scope tour.
- [Power supply](./power-supply.md) — PSU panels.
- [Multimeter](./multimeter.md) — DMM panels.
- [Raw SCPI](./raw-scpi.md) — talk directly to the instrument.
