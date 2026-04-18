# Raw SCPI

Every connected instrument exposes a **Raw SCPI** console, even when a
typed driver is active. It is the fallback for identifiable gear we
do not have a driver for yet, and a debugging aid when a typed panel
does not show what you expect.

## Safety defaults

::: warning No implicit system writes
- **`*RST` is gated** behind a confirmation dialog. No other SCPI is
  sent without an explicit user action.
- The server never issues `:SYSTem:PRESet`, `:SYSTem:DATE`, or any
  implicit system-wide write. If you want one, type it yourself.
:::

## Safe mode

**Safe mode** is a browser-only switch (header: **Safe mode**, shortcut `g` then `s`) that dims write paths across the app while leaving readbacks, queries, and the **Panic stop** control available. It persists in this browser’s `localStorage` and is meant as an ergonomic guard when you are reviewing a bench or sharing a screen — it is **not** authentication and does not change server behaviour.

In the Raw SCPI console, **Query** stays enabled; **Write** is disabled until you turn safe mode off.

- **Queries vs writes** — the console parses the command and uses
  `query` for anything ending in `?`, `write` otherwise. Binary
  replies (`IEEE-488.2` block) are not decoded in the console; use a
  typed panel or a custom script for waveform bytes.

## Tips

- **Up / Down arrows** navigate the command history (per session).
- **Responses wrap** with a monospace font; long blobs are truncated
  after ~64 KiB to avoid freezing the page.
- A "Copy" button on the response cell puts the full text on the
  clipboard.

## When to prefer raw SCPI

- You are exploring a new instrument and want to learn its command
  set before writing a driver.
- The typed panel lacks a setting the instrument exposes natively.
- You are reproducing a bug and need to share the exact bytes.
