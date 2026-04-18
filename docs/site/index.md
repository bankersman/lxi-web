---
layout: home
hero:
  name: "lxi-web"
  text: "A dashboard for your LXI bench."
  tagline: "Connect an oscilloscope, a power supply, and a multimeter at once. Live readouts on a card grid, typed panels per instrument, raw SCPI when you need it."
  actions:
    - theme: brand
      text: Get started
      link: /manual/installation
    - theme: alt
      text: Report your hardware
      link: https://github.com/lxi-web/lxi-web/issues/new?template=instrument-report.yml
features:
  - title: Multi-instrument dashboard
    details: Card grid with live trigger / rail / primary-reading tiles. Open any card for the full panel.
  - title: Typed drivers for Rigol gear
    details: DHO804 (scope), DP932E (PSU), DM858 (DMM) out of the box. Anything else falls back to raw SCPI.
  - title: mDNS discovery
    details: Scan the LAN for Bonjour / DNS-SD-advertising instruments and connect in two clicks.
  - title: Resilient sessions
    details: TCP drops surface as a red status with a Reconnect button. `sessionId` stays stable across reconnects.
  - title: Browser-local address book
    details: Save instruments and optionally auto-connect on launch. All storage lives in your browser.
  - title: Built for solo engineers
    details: One Docker container, trusted LAN, no multi-user auth. What you would deploy on your own workbench.
  - title: Drivers without the dashboard
    details: "`@lxi-web/core` publishes the SCPI transport, façades, and Rigol drivers to npm so you can script instruments straight from Node."
    link: /manual/embed-core
    linkText: Read the embed guide
---
