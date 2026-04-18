# Multimeter panel

Verified driver: **Rigol DM858**. Other LXI DMMs fall back to raw SCPI.

## Section order

1. **Overview card** — identity, status, quick actions.
2. **Primary reading + mode + range** — the large readout sits at the
   top and is the first thing to land on when you open the page.
3. **Dual display / math / ranging** — secondary reading, math
   functions (null, dB, dBm, min/max/avg, limit), ranging + NPLC +
   auto-zero.
4. **Trigger** — source, slope, delay, count.
5. **Logging** — trend chart + CSV export.
6. **Temperature** — transducer type, unit, reference junction.
7. **Presets** — saved mode/range setups.
8. **Raw SCPI** — collapsible at the bottom.

## Trend logger

- Data is buffered **in the browser only**; closing the tab drops it.
- **Export CSV** downloads the buffered readings with millisecond
  timestamps.
- The logger does not throttle the instrument — set a sensible NPLC
  to keep sample rates reasonable.
