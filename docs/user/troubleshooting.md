# Troubleshooting

## "Connection refused"

- The instrument is powered off, not on the LAN, or on a different
  subnet.
- The SCPI-raw port is wrong. Rigol defaults to **5555**;
  Keysight / Tektronix commonly use **5025**; **Owon** XDM / SPE / XDS
  listen on **3000**.
- A host firewall is blocking outbound TCP from the server. Whitelist
  the target host / port.

## "Could not open WebSocket" in the browser

- The API is not running, or a reverse proxy is stripping
  `Upgrade` / `Connection` headers.
- Mixed-content: you loaded the UI over HTTPS but the WebSocket URL
  is `ws://…`. Front the whole app with the same TLS proxy.

## Scan the LAN is empty

- mDNS (UDP 5353) does not cross subnets by default.
- Docker's default bridge network does not pass multicast. Run with
  `--network host` on Linux, or add the instrument manually.
- The instrument may not advertise via DNS-SD at all. Use **Enter
  host & port** instead.

::: warning Owon instruments skip mDNS
**Owon** XDM / SPE / XDS instruments frequently do not advertise
`_lxi._tcp` at all. They will never show up in the Scan list, even
on the same subnet. Add them manually with the instrument's static
IP and port **3000** (not 5025).
:::

## Auto-connect stops reopening saved devices

- Your browser cleared `localStorage` (private mode, site-data
  purge). Re-add the devices.
- You opened the app in a different browser / profile — the address
  book is per-origin, not per-user.

## Session goes red with `ETIMEDOUT` / `ECONNRESET`

- The instrument rebooted or the LAN flapped. Click **Reconnect**.
- Some instruments drop idle TCP sessions after a few minutes. The
  Reconnect flow is designed for this.

## Where to get help

1. Check [docs/user/hardware-reports.md](./hardware-reports.md) for
   known quirks of your model.
2. Open a [bug report](https://github.com/bankersman/lxi-web/issues/new?template=bug.yml) with the
   `*IDN?` string and the raw SCPI log if relevant.
