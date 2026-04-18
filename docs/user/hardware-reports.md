# Hardware reports

The project ships with typed drivers for a small set of Rigol
instruments. Anything else falls back to raw SCPI. Hardware reports
are how we grow the driver matrix.

## How `*IDN?` matching works

The server asks every new connection `*IDN?` and parses the response
into `manufacturer / model / serial / firmware`. A registry maps
`(manufacturer, modelPattern)` tuples to a device kind and driver.
Unknown entries route to the raw SCPI console but **still** get a
typed identity card on the dashboard.

## Filing a report

Use the [instrument-report](../../.github/ISSUE_TEMPLATE/instrument-report.yml)
issue template. Include:

- The exact `*IDN?` response (copy it from the overview card on the
  device page).
- Vendor, model, device kind, firmware version.
- What **worked** — which panels, which controls.
- What **failed** — commands that returned errors, behaviour that
  looked wrong, SCPI snippets that surprised you.
- The dashboard version (`git rev-parse HEAD` for source builds, or
  the image digest for Docker).

## From report to driver

A report is enough to:

1. Add the instrument to the supported-hardware matrix with a
   `pattern-only` status (so others know the raw SCPI path works).
2. Decide whether the instrument fits an existing driver shape (e.g.
   the Rigol scope driver also works on several other DHO-series
   models with the same SCPI vocabulary) or deserves its own.
3. Open a tracking issue and reference the report.
