# Rigol DM858 Series — SCPI API Reference

> Derived from Chapter 3 of the DM858 Series Programming Guide (PGC11100-1110, SW 00.01.00).  
> All section numbers match the original document.  
> Commands communicate via USB or LAN. Parameters without units are unitless unless stated.  
> Optional parts of a command keyword are shown in `[brackets]`.

---

## Notation

| Symbol | Meaning |
|--------|---------|
| `<param>` | Required parameter |
| `[param]` | Optional parameter |
| `{A\|B}` | Discrete choice |
| `<lim>` | `MIN`, `MAX`, or `DEF` |
| `<bool>` | `0`, `1`, `OFF`, or `ON` |
| `?` suffix | Query form of a command |

**Resolution / Integration time table (referenced throughout):**

| Resolution | Speed | Integration time |
|-----------|-------|-----------------|
| 1000 ppm × range | Fast | 0.4 PLC |
| 100 ppm × range | Medium | 5 PLC |
| 10 ppm × range | Slow | 20 PLC (default) |

> 1 PLC = 0.02 s

**Math operation availability by function:**

| Function | Supported math |
|---------|---------------|
| DCV / ACV | Statistics, Limit, dBm, dB, Relative |
| DCI / ACI | Statistics, Limit, Relative |
| 2WR / 4WR | Statistics, Limit, Relative |
| CAP | Statistics, Limit, Relative |
| SENSOR | Statistics, Limit, Relative |
| FREQ / PERIOD | Statistics, Limit, Relative |
| CONT / DIODE | None |

---

## 3.1 ABORt

```
ABORt
```

Aborts a measurement in progress, returning the instrument to the trigger idle state. Valid when waiting for a trigger or during a prolonged measurement.

- **Parameters:** None
- **Returns:** Nothing

```
ABORt
```

---

## 3.2 FETCh?

```
FETCh?
```

Waits for pending measurements to complete and transfers the reading from memory to the output buffer. Does **not** clear reading memory.

- **Parameters:** None
- **Returns:** The reading. If memory is empty, no value is returned.

> DM858: up to 500,000 readings stored. DM858E: up to 20,000. On overflow, oldest readings are overwritten.

```
FETCh?
```

---

## 3.3 INITiate[:IMMediate]

```
INITiate[:IMMediate]
```

Changes trigger state from idle to wait-for-trigger. Measurements begin when the specified trigger conditions are satisfied; results are stored in reading memory.

- **Parameters:** None
- **Returns:** Nothing

```
INITiate:IMMediate
```

---

## 3.4 OUTPut:TRIGger:SLOPe

```
OUTPut:TRIGger:SLOPe <polar>
OUTPut:TRIGger:SLOPe?
```

Sets or queries the output polarity of the VM Comp (VMC) signal on the rear-panel `[VM COMP]` connector after each measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<polar>` | Discrete | `POSitive` \| `NEGative` | `POSitive` |

- **Returns (query):** `POS` or `NEG`

```
OUTPut:TRIGger:SLOPe POSitive
OUTPut:TRIGger:SLOPe?         → POS
```

---

## 3.5 R?

```
R? [<max_readings>]
```

Reads **and removes** the specified number of measurement results from reading memory, starting from the oldest.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<max_readings>` | Integer | DM858: 1–500,000 / DM858E: 1–20,000 | All readings |

- **Returns:** Binary block string, e.g. `#247-1.63969181E+01,-2.81863565E+01,...`  
  The `#2` prefix means the next 2 digits indicate the byte count of the remaining string.

```
R? 3    → #247-1.63969181E+01,-2.81863565E+01,-3.03502037E+01
```

---

## 3.6 READ?

```
READ?
```

Begins a new measurement group, waits for all measurements to complete, and sends all available results. Clears and rewrites reading memory.

- **Parameters:** None
- **Returns:** One or more measurement results in scientific notation.

```
READ?    → -4.98748741E-01,-4.35163427E-01,-4.33118686E-01,-3.48109378E-01
```

---

## 3.7 SAMPle:COUNt

```
SAMPle:COUNt {<value>|<lim>}
SAMPle:COUNt?
```

Sets or queries the number of samples per trigger in Single trigger mode. Total measurements = `SAMPle:COUNt` × `TRIGger:COUNt`.

> **Restriction:** Only valid when `TRIGger:SOURce` is set to Single trigger (`BUS`). Has no effect in `IMMediate` or `EXTernal` trigger mode.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Integer | 1–2000 | 1 |
| `<lim>` | Discrete | `MIN` \| `MAX` \| `DEF` | — |

- **Returns (query):** Integer

```
SAMPle:COUNt 200
SAMPle:COUNt?     → 200
```

---

## 3.8 UNIT:TEMPerature

```
UNIT:TEMPerature <unit>
UNIT:TEMPerature?
```

Sets or queries the unit used for temperature measurements.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<unit>` | Discrete | `C` \| `F` \| `K` | `C` |

- **Returns (query):** `C`, `F`, or `K`

```
UNIT:TEMPerature F
UNIT:TEMPerature?    → F
```

---

## 3.9 CALCulate Commands

### 3.9.1 CALCulate:AVERage:ALL?

```
CALCulate:AVERage:ALL?
```

Queries average, standard deviation, minimum, and maximum for the Statistics operation.

> **Restriction:** Valid only when the Statistics operation is enabled (`CALCulate:AVERage[:STATe] ON`).

- **Parameters:** None
- **Returns:** `avg,sdev,min,max` in scientific notation, e.g. `-6.60019915E+01,3.12397977E-04,-6.60040000E+01,-6.60010000E+01`

```
CALCulate:AVERage:ALL?
```

---

### 3.9.2 CALCulate:AVERage:AVERage?

```
CALCulate:AVERage:AVERage?
```

Queries the average value from the Statistics operation.

> **Restriction:** Valid only when the Statistics operation is enabled (`CALCulate:AVERage[:STATe] ON`).

- **Parameters:** None
- **Returns:** Average value in scientific notation, e.g. `1.23450000E+01`

```
CALCulate:AVERage:AVERage?    → 1.23450000E+01
```

---

### 3.9.3 CALCulate:AVERage:CLEar[:IMMediate]

```
CALCulate:AVERage:CLEar[:IMMediate]
```

Clears all calculated statistics (min, max, average, count, standard deviation). Does **not** clear reading memory. To clear everything including reading memory, use `CALCulate:CLEar[:IMMediate]`.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.9.4 CALCulate:AVERage:COUNt?

```
CALCulate:AVERage:COUNt?
```

Queries the number of readings accumulated for the Statistics operation.

> **Restriction:** Valid only when the Statistics operation is enabled (`CALCulate:AVERage[:STATe] ON`).

- **Parameters:** None
- **Returns:** Integer, e.g. `11986`

```
CALCulate:AVERage:COUNt?    → 11986
```

---

### 3.9.5 CALCulate:AVERage:MAXimum?

```
CALCulate:AVERage:MAXimum?
```

Queries the maximum value from the Statistics operation.

> **Restriction:** Valid only when the Statistics operation is enabled (`CALCulate:AVERage[:STATe] ON`).

- **Parameters:** None
- **Returns:** Maximum value in scientific notation

```
CALCulate:AVERage:MAXimum?    → -2.40000000E+01
```

---

### 3.9.6 CALCulate:AVERage:MINimum?

```
CALCulate:AVERage:MINimum?
```

Queries the minimum value from the Statistics operation.

> **Restriction:** Valid only when the Statistics operation is enabled (`CALCulate:AVERage[:STATe] ON`).

- **Parameters:** None
- **Returns:** Minimum value in scientific notation

```
CALCulate:AVERage:MINimum?    → -2.70000000E+01
```

---

### 3.9.7 CALCulate:AVERage:SDEViation?

```
CALCulate:AVERage:SDEViation?
```

Queries the standard deviation from the Statistics operation.

> **Restriction:** Valid only when the Statistics operation is enabled (`CALCulate:AVERage[:STATe] ON`).

- **Parameters:** None
- **Returns:** Standard deviation in scientific notation

```
CALCulate:AVERage:SDEViation?    → 3.50353538E-04
```

---

### 3.9.8 CALCulate:AVERage[:STATe]

```
CALCulate:AVERage[:STATe] <bool>
CALCulate:AVERage[:STATe]?
```

Enables or disables the Statistics operation. Not available when range is set to auto.

> **Restrictions:** Only available for measurement functions that support Statistics (DCV, ACV, DCI, ACI, 2WR, 4WR, CAP, SENSOR, FREQ, PERIOD — see math operation table above). Not available when the range is set to auto range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

```
CALCulate:AVERage ON
CALCulate:AVERage?    → 1
```

---

### 3.9.9 CALCulate:CLEar[:IMMediate]

```
CALCulate:CLEar[:IMMediate]
```

Clears all limit values, histogram data, statistical information, and measurement results.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.9.10 CALCulate:LIMit:CLEar[:IMMediate]

```
CALCulate:LIMit:CLEar[:IMMediate]
```

Clears limit operation results and clears bits 11 (Lower Limit Failed) and 12 (Upper Limit Failed) in the Questionable Data register. Does **not** clear reading memory.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.9.11 CALCulate:LIMit:LOWer[:DATA]

```
CALCulate:LIMit:LOWer[:DATA] {<value>|<lim>}
CALCulate:LIMit:LOWer[:DATA]?
```

Sets or queries the lower limit for the current limit operation. Range: −120% to +120% of the maximum measurement range. Cannot exceed the current upper limit (`CALCulate:LIMit:UPPer[:DATA]`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% of max range | `0` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Lower limit in scientific notation

```
CALCulate:LIMit:LOWer:DATA 1
CALCulate:LIMit:LOWer:DATA?    → +1.00000000E+00
```

---

### 3.9.12 CALCulate:LIMit[:STATe]

```
CALCulate:LIMit[:STATe] <bool>
CALCulate:LIMit[:STATe]?
```

Enables or disables the limit operation. Not available when range is auto.

> **Restrictions:** Only available for measurement functions that support limit operation (DCV, ACV, DCI, ACI, 2WR, 4WR, CAP, SENSOR, FREQ, PERIOD — see math operation table above). Not available when the range is set to auto range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

```
CALCulate:LIMit:STATe ON
CALCulate:LIMit:STATe?    → 1
```

---

### 3.9.13 CALCulate:LIMit:UPPer[:DATA]

```
CALCulate:LIMit:UPPer[:DATA] {<value>|<lim>}
CALCulate:LIMit:UPPer[:DATA]?
```

Sets or queries the upper limit for the current limit operation. Range: −120% to +120% of the maximum measurement range. Cannot be less than the current lower limit.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% of max range | `0` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Upper limit in scientific notation

```
CALCulate:LIMit:UPPer:DATA 2
CALCulate:LIMit:UPPer:DATA?    → +2.00000000E+00
```

---

### 3.9.14 CALCulate:SCALe:DB:REFerence

```
CALCulate:SCALe:DB:REFerence {<value>|<lim>}
CALCulate:SCALe:DB:REFerence?
```

Sets or queries the dB reference value used in dB scaling. The result is: dBm(measurement) − dBm(reference).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120 dBm to 120 dBm | `0` dBm |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** dB reference value, e.g. `10.000000`

```
:CALCulate:SCALe:DB:REFerence 10
:CALCulate:SCALe:DB:REFerence?    → 10.000000
```

---

### 3.9.15 CALCulate:SCALe:DBM:REFerence

```
CALCulate:SCALe:DBM:REFerence {<value>|<lim>}
CALCulate:SCALe:DBM:REFerence?
```

Sets or queries the reference resistance for dBm scaling. Formula: dBm = 10 × log₁₀(V² / R_ref / 1 mW).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | 2 Ω to 8000 Ω | 600 Ω |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Reference resistance, e.g. `100.000000`

```
CALCulate:SCALe:DBM:REFerence 100
CALCulate:SCALe:DBM:REFerence?    → 100.000000
```

---

### 3.9.16 CALCulate:SCALe:FUNCtion

```
CALCulate:SCALe:FUNCtion <type>
CALCulate:SCALe:FUNCtion?
```

Selects which scaling operation to apply (dB or dBm). Must be called before enabling scaling with `CALCulate:SCALe[:STATe]`. Applies to ACV and DCV only.

> **Restrictions:** dB and dBm scaling both apply **only to ACV and DCV measurements**. For dB: result = measurement (dBm) − reference value (dBm). For dBm: result = 10 × log₁₀(V² / R_ref / 1 mW).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<type>` | Discrete | `DB`\|`DBM` | — |

- **Returns (query):** `DB` or `DBM`

```
CALCulate:SCALe:FUNCtion DB
CALCulate:SCALe:FUNCtion?    → DB
```

---

### 3.9.17 CALCulate:SCALe[:STATe]

```
CALCulate:SCALe[:STATe] <bool>
CALCulate:SCALe[:STATe]?
```

Enables or disables the scaling function. `CALCulate:SCALe:FUNCtion` must be set first. Scaling is reset when switching measurement functions. Not available in auto range.

> **Restrictions:**
> - Valid **only for dB/dBm-capable measurement functions** (ACV and DCV only — see math operation table above).
> - Scaling is automatically disabled when the measurement function changes (e.g. DCV → ACV); **you must re-enable scaling** after each function switch.
> - Cannot be enabled when the range is set to auto range.
> - `CALCulate:SCALe:FUNCtion` must be executed **before** enabling scaling with this command.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

```
:CALCulate:SCALe:STATe ON
:CALCulate:SCALe:STATe?    → 1
```

---

## 3.10 CONFigure Commands

> CONFigure commands preset measurement parameters but do **not** initiate a measurement. Use `V`, `A`, `Hz`, `Ω` as default units for `<range>` and `<resolution>` parameters.

### 3.10.1 CONFigure:CAPacitance

```
CONFigure:CAPacitance [{<range>|<lim>}]
```

Presets range for capacitance measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `1nF`\|`10nF`\|`100nF`\|`1μF`\|`10μF`\|`100μF`\|`1mF`\|`10mF`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

> `10mF` range is DM858 only (DM858E max: 1 mF). Scientific notation accepted, e.g. `1E-6` = 1 μF.

```
CONFigure:CAPacitance 1E-9
CONFigure?    → CAP 1.00000000E-09
```

---

### 3.10.2 CONFigure:CONTinuity

```
CONFigure:CONTinuity
```

Presets all continuity measurement and trigger parameters to defaults.

- **Parameters:** None

```
CONFigure:CONTinuity
CONFigure?    → CONT
```

---

### 3.10.3 CONFigure:CURRent:AC

```
CONFigure:CURRent:AC [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Presets range and resolution for AC current measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100μA`\|`1mA`\|`10mA`\|`100mA`\|`1A`\|`3A`\|`10A`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

> 3 A range: DM858E only. 10 A range: DM858 only.

```
CONFigure:CURRent:AC 1,1E-5
CONFigure?    → CURR:AC 1.00000000E+00,1.00000000E-05
```

---

### 3.10.4 CONFigure:CURRent:DC

```
CONFigure:CURRent:DC [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Presets range and resolution for DC current measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100μA`\|`1mA`\|`10mA`\|`100mA`\|`1A`\|`3A`\|`10A`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

> 3 A range: DM858E only. 10 A range: DM858 only.

```
CONFigure:CURRent:DC 1,1E-5
CONFigure?    → CURR 1.00000000E+00,1.00000000E-05
```

---

### 3.10.5 CONFigure:DIODe

```
CONFigure:DIODe
```

Presets all diode measurement and trigger parameters to defaults.

- **Parameters:** None

```
CONFigure:DIODe
CONFigure?    → DIOD
```

---

### 3.10.6 CONFigure:FREQuency

```
CONFigure:FREQuency
```

Presets all frequency measurement and trigger parameters to defaults.

- **Parameters:** None

```
CONFigure:FREQuency
CONFigure?    → FREQ
```

---

### 3.10.7 CONFigure:FRESistance

```
CONFigure:FRESistance [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Presets range and resolution for 4-wire resistance measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100Ω`\|`1kΩ`\|`10kΩ`\|`100kΩ`\|`1MΩ`\|`10MΩ`\|`100MΩ`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

```
CONFigure:FRESistance 1000,1E-2
CONFigure?    → FRES 1.00000000E+03,1.00000000E-02
```

---

### 3.10.8 CONFigure:PERiod

```
CONFigure:PERiod
```

Presets all period measurement and trigger parameters to defaults.

- **Parameters:** None

```
CONFigure:PERiod
CONFigure?    → PER
```

---

### 3.10.9 CONFigure:RESistance

```
CONFigure:RESistance [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Presets range and resolution for 2-wire resistance measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100Ω`\|`1kΩ`\|`10kΩ`\|`100kΩ`\|`1MΩ`\|`10MΩ`\|`100MΩ`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

```
CONFigure:RESistance 1000,1E-2
CONFigure?    → RES 1.00000000E+03,1.00000000E-02
```

---

### 3.10.10 CONFigure:TEMPerature

```
CONFigure:TEMPerature [{<probe_type>|<lim>}[,<type>]]
```

Presets temperature measurement and trigger parameters for the specified sensor.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<probe_type>` | Discrete | `FRTD`\|`RTD`\|`FTHermistor`\|`THERmistor`\|`TCouple` | `TCouple` |
| `<lim>` | Discrete | `DEFault` | — |
| `<type>` | Discrete | `385`\|`389`\|`391`\|`392` (RTD coeff) \| `2200`\|`3000`\|`5000`\|`10000`\|`30000` (thermistor Ω) \| `B`\|`E`\|`J`\|`K`\|`N`\|`R`\|`S`\|`T` (thermocouple) | — |

```
CONFigure:TEMPerature FRTD,385
CONFigure?    → TEMP FRTD,385
```

---

### 3.10.11 CONFigure:VOLTage:AC

```
CONFigure:VOLTage:AC [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Presets range and resolution for AC voltage measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`750V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

```
CONFigure:VOLTage:AC 10,1E-3
CONFigure?    → VOLT:AC 1.00000000E+01,1.00000000E-03
```

---

### 3.10.12 CONFigure:VOLTage:DC

```
CONFigure:VOLTage:DC [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Presets range and resolution for DC voltage measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`1000V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

```
CONFigure:VOLTage:DC 10,1E-3
CONFigure?    → VOLT 1.00000000E+01,1.00000000E-03
```

---

### 3.10.13 CONFigure?

```
CONFigure?
```

Queries the current measurement function, range, and resolution.

- **Parameters:** None
- **Returns:** String with function, range, and resolution (if applicable), e.g. `VOLT:AC 1.00000000E+01,1.00000000E-03`

---

## 3.11 DATA Commands

### 3.11.1 DATA:LAST?

```
DATA:LAST?
```

Queries the most recently completed measurement value and function.

- **Parameters:** None
- **Returns:** String `<value> <function>`, e.g. `-5.07000000E-01 VDC`. Returns `9.90000000E+37` if no data is available.

```
DATA:LAST?    → -5.07000000E-01 VDC
```

---

### 3.11.2 DATA:POINts?

```
DATA:POINts?
```

Queries the total number of readings currently stored in reading memory.

- **Parameters:** None
- **Returns:** Integer. DM858 max 500,000; DM858E max 20,000.

```
DATA:POINts?    → 1099
```

---

### 3.11.3 DATA:POINts:EVENt:THReshold

```
DATA:POINts:EVENt:THReshold <count>
DATA:POINts:EVENt:THReshold?
```

Sets or queries the memory threshold. When reading count reaches this value, bit 9 (Memory Threshold) is set in the Operation Status register.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<count>` | Integer | DM858: 1–500,000 / DM858E: 1–20,000 | Model maximum |

- **Returns (query):** Integer

```
DATA:POINts:EVENt:THReshold 10
DATA:POINts:EVENt:THReshold?    → 10
```

---

### 3.11.4 DATA:REMove?

```
DATA:REMove? <num>[,<wait>]
```

Reads **and removes** the specified number of readings from reading memory (oldest first). If `WAIT` is specified and `<num>` exceeds available readings, the query blocks until enough readings are available.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<num>` | Integer | DM858: 1–500,000 / DM858E: 1–20,000 | — |
| `<wait>` | Discrete | `WAIT` | — |

- **Returns:** String of readings separated by semicolons

```
DATA:REMove? 3    → 1.21770000E+02;9.85760000E+02;9.86260000E+02
```

---

## 3.12 HCOPy Commands

### 3.12.1 HCOPy:SDUMp:DATA?

```
HCOPy:SDUMp:DATA?
```

Captures and returns the front-panel display as a binary image. Format is set by `HCOPy:SDUMp:DATA:FORMat`.

- **Parameters:** None
- **Returns:** Definite-length binary block containing the image

---

### 3.12.2 HCOPy:SDUMp:DATA:FORMat

```
HCOPy:SDUMp:DATA:FORMat <type>
HCOPy:SDUMp:DATA:FORMat?
```

Sets or queries the screenshot image format.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<type>` | Discrete | `PNG`\|`BMP` | `PNG` |

- **Returns (query):** `PNG` or `BMP`

```
HCOPy:SDUMp:DATA:FORMat BMP
HCOPy:SDUMp:DATA:FORMat?    → BMP
```

---

## 3.13 IEEE 488.2 Common Commands

> Common commands start with `*`. They interact with the Standard Event Status Register (SESR) and Status Byte Register (SBR).

**Standard Event Status Register bit definitions:**

| Bit | Name | Decimal | Description |
|-----|------|---------|-------------|
| 0 | OPC | 1 | Operation complete |
| 2 | QYE | 4 | Query error |
| 3 | DDE | 8 | Device-specific error |
| 4 | EXE | 16 | Execution error |
| 5 | CME | 32 | Command error |
| 7 | PON | 128 | Power on |

**Status Byte Register bit definitions:**

| Bit | Name | Decimal | Description |
|-----|------|---------|-------------|
| 2 | — | 4 | Error queue non-empty |
| 3 | QDS | 8 | Questionable data summary |
| 4 | MAV | 16 | Message available in output buffer |
| 5 | ESB | 32 | Standard event summary |
| 6 | MSS | 64 | Master summary status / RQS |
| 7 | OSR | 128 | Operation status register summary |

---

### 3.13.1 *CLS

```
*CLS
```

Clears all event registers and the error queue.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.13.2 *ESE

```
*ESE <maskargument>
*ESE?
```

Sets or queries the enable register for the Standard Event Status Register. `<maskargument>` is the decimal sum of bits to enable (e.g. bits 2+3+7 = 4+8+128 = 140).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<maskargument>` | Integer | 0–255 | 0 |

- **Returns (query):** Integer (decimal-weighted sum of enabled bits)

```
*ESE 16
*ESE?    → 16
```

---

### 3.13.3 *ESR?

```
*ESR?
```

Queries **and clears** the Standard Event Status Register event register. Bits 1 and 6 are unused and always 0.

- **Parameters:** None
- **Returns:** Integer (decimal-weighted sum of set bits)

---

### 3.13.4 *IDN?

```
*IDN?
```

Queries the instrument identification string.

- **Parameters:** None
- **Returns:** `RIGOL TECHNOLOGIES,<model>,<serial number>,<software version>`

---

### 3.13.5 *OPC

```
*OPC
*OPC?
```

`*OPC` sets bit 0 (OPC) in the Standard Event Status Register when all pending operations complete.  
`*OPC?` queries whether the current operation has finished.

- **Returns (query):** `1` when complete, `0` otherwise

---

### 3.13.6 *PSC

```
*PSC <bool>
*PSC?
```

Sets or queries whether enable registers are cleared at power-on. `1` = clear on power-on; `0` = retain.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1` | `0` |

- **Returns (query):** `0` or `1`

```
*PSC 1
*PSC?    → 1
```

---

### 3.13.7 *RST

```
*RST
```

Restores the instrument to factory default settings. Does **not** clear the error queue.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.13.8 *SRE

```
*SRE <maskargument>
*SRE?
```

Sets or queries the enable register for the Status Byte Register.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<maskargument>` | Integer | 0–255 | 0 |

- **Returns (query):** Integer

```
*SRE 16
*SRE?    → 16
```

---

### 3.13.9 *STB?

```
*STB?
```

Queries and clears the Status Byte Register event register. Bits 0 and 1 are unused (always 0); returned value is a binary-weighted decimal in range `XXXXXX00`.

- **Parameters:** None
- **Returns:** Integer

---

### 3.13.10 *TRG

```
*TRG
```

Generates a software trigger event.

> **Restriction:** Only valid when trigger source is `BUS` (`TRIGger:SOURce BUS`) **and** the instrument is in the wait-for-trigger state. Has no effect otherwise.

- **Parameters:** None
- **Returns:** Nothing

```
*TRG
```

---

## 3.14 LXI Commands

### 3.14.1 LXI:MDNS:ENABle

```
LXI:MDNS:ENABle <bool>
LXI:MDNS:ENABle?
```

Enables or disables multicast DNS (mDNS), which provides DNS resolution in networks without a dedicated DNS server.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

```
LXI:MDNS:ENABle ON
LXI:MDNS:ENABle?    → 1
```

---

### 3.14.2 LXI:MDNS:HNAMe[:RESolved]?

```
LXI:MDNS:HNAMe[:RESolved]?
```

Queries the resolved mDNS hostname.

- **Parameters:** None
- **Returns:** String in double quotes

---

### 3.14.3 LXI:MDNS:SNAMe:DESired

```
LXI:MDNS:SNAMe:DESired "<n>"
LXI:MDNS:SNAMe:DESired?
```

Sets or queries the desired mDNS service name (max 30 characters, enclosed in double quotes).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<n>` | ASCII string | Max 30 chars | — |

- **Returns (query):** String in double quotes

```
LXI:MDNS:SNAMe:DESired "rigolDM"
LXI:MDNS:SNAMe:DESired?    → "rigolDM"
```

---

### 3.14.4 LXI:MDNS:SNAMe[:RESolved]?

```
LXI:MDNS:SNAMe[:RESolved]?
```

Queries the resolved (actual) mDNS service name.

- **Parameters:** None
- **Returns:** String in double quotes, e.g. `"RIGOL MULTIMETER"`

```
LXI:MDNS:SNAMe:RESolved?    → "RIGOL MULTIMETER"
```

---

### 3.14.5 LXI:RESet

```
LXI:RESet
```

Resets all LAN parameters to factory defaults.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.14.6 LXI:RESTart

```
LXI:RESTart
```

Applies current LAN settings and restarts the LAN interface. The interface may take several seconds to restart.

- **Parameters:** None
- **Returns:** Nothing

---

## 3.15 MEASure Commands

> MEASure commands combine CONFigure + INITiate + FETCh? in a single call. Other measurement parameters are set to defaults.

### 3.15.1 MEASure:CAPacitance?

```
MEASure:CAPacitance? [{<range>|<lim>}]
```

Configures, performs, and returns a capacitance measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `1nF`\|`10nF`\|`100nF`\|`1μF`\|`10μF`\|`100μF`\|`1mF`\|`10mF`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns:** Reading in scientific notation. `9.9E37` if out of range.

```
MEASure:CAPacitance? 1E-8    → +3.0153000E-09
```

---

### 3.15.2 MEASure:CONTinuity?

```
MEASure:CONTinuity?
```

Configures, performs, and returns a continuity measurement.

- **Parameters:** None
- **Returns:** Measurement value. Returns `9.9E37` if resistance > 1.2 kΩ.

```
MEASure:CONTinuity?    → 8.40000000E+00
```

---

### 3.15.3 MEASure:CURRent:AC?

```
MEASure:CURRent:AC? [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Configures, performs, and returns an AC current measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100μA`\|`1mA`\|`10mA`\|`100mA`\|`1A`\|`3A`\|`10A`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

- **Returns:** AC current in scientific notation

```
MEASure:CURRent:AC? 1,1E-5    → 3.19800000E-02
```

---

### 3.15.4 MEASure:CURRent:DC?

```
MEASure:CURRent:DC? [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Configures, performs, and returns a DC current measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100μA`\|`1mA`\|`10mA`\|`100mA`\|`1A`\|`3A`\|`10A`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

- **Returns:** DC current in scientific notation

```
MEASure:CURRent:DC? 1,1E-5    → 1.20000000E-01
```

---

### 3.15.5 MEASure:DIODe?

```
MEASure:DIODe?
```

Configures, performs, and returns a diode measurement. Fixed range: 2 V.

- **Parameters:** None
- **Returns:** Voltage if < 2.1 V; `9.9E37` if > 2.1 V or open circuit.

```
MEASure:DIODe?    → 1.40000000E-01
```

---

### 3.15.6 MEASure:FREQuency?

```
MEASure:FREQuency?
```

Configures, performs, and returns a frequency measurement.

- **Parameters:** None
- **Returns:** Frequency in scientific notation. Returns `0` if no signal connected.

```
MEASure:FREQuency?    → 2.40000000E+02
```

---

### 3.15.7 MEASure:FRESistance?

```
MEASure:FRESistance? [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Configures, performs, and returns a 4-wire resistance measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100Ω`\|`1kΩ`\|`10kΩ`\|`100kΩ`\|`1MΩ`\|`10MΩ`\|`100MΩ`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

- **Returns:** Resistance in scientific notation

```
MEASure:FRESistance? 1000,1E-2    → 7.50000000E+02
```

---

### 3.15.8 MEASure:PERiod?

```
MEASure:PERiod?
```

Configures, performs, and returns a period measurement.

- **Parameters:** None
- **Returns:** Period in scientific notation. Returns `9.9E37` if no signal.

```
MEASure:PERiod?    → 2.00000000E-02
```

---

### 3.15.9 MEASure:RESistance?

```
MEASure:RESistance? [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Configures, performs, and returns a 2-wire resistance measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100Ω`\|`1kΩ`\|`10kΩ`\|`100kΩ`\|`1MΩ`\|`10MΩ`\|`100MΩ`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

- **Returns:** Resistance in scientific notation

```
MEASure:RESistance? 1000,1E-2    → 7.50000000E+02
```

---

### 3.15.10 MEASure:TEMPerature?

```
MEASure:TEMPerature? [{<probe_type>|<lim>}[,<type>]]
```

Configures, performs, and returns a temperature measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<probe_type>` | Discrete | `FRTD`\|`RTD`\|`FTHermistor`\|`THERmistor`\|`TCouple` | `TCouple` |
| `<lim>` | Discrete | `DEFault` | — |
| `<type>` | Discrete | RTD: `385`\|`389`\|`391`\|`392` / Thermistor: `2200`\|`3000`\|`5000`\|`10000`\|`30000` / TC: `B`\|`E`\|`J`\|`K`\|`N`\|`R`\|`S`\|`T` | — |

- **Returns:** Temperature in scientific notation

```
MEASure:TEMPerature? FTHermistor,5000    → 4.87268785E+01
```

---

### 3.15.11 MEASure:VOLTage:AC?

```
MEASure:VOLTage:AC? [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Configures, performs, and returns an AC voltage measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`750V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

- **Returns:** AC voltage in scientific notation

```
MEASure:VOLTage:AC? 10,1E-3    → 7.62810000E+00
```

---

### 3.15.12 MEASure:VOLTage:DC?

```
MEASure:VOLTage:DC? [{<range>|<lim>}[,{<resolution>|<lim>}]]
```

Configures, performs, and returns a DC voltage measurement.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`1000V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |
| `<resolution>` | Real | See resolution table | 10 ppm × range |

- **Returns:** DC voltage in scientific notation

```
MEASure:VOLTage:DC? 10,1E-3    → 1.73810000E+00
```

---

## 3.16 MMEMory Commands

> Internal filesystem prefix: `INT:\`. External USB prefix: `USB:\`. USB storage must be inserted to be available.

### 3.16.1 MMEMory:CATalog[:ALL]?

```
MMEMory:CATalog[:ALL]? "<folder>"
```

Lists all files in the specified directory. If `<folder>` is omitted, uses the current directory (`MMEMory:CDIRectory`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<folder>` | ASCII string | Valid directory | Current directory |

- **Returns:** `space_used,space_available,"filename,property,size",...`  
  File property: `STAT` (.sta), `ASC` (.csv), `PREF` (.prf), `FOLD` (folder), or empty.

```
MMEMory:CATalog:ALL? "INT:\Data"
```

---

### 3.16.2 MMEMory:CDIRectory

```
MMEMory:CDIRectory "<directory_name>"
MMEMory:CDIRectory?
```

Sets or queries the default working directory for MMEMory commands.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<directory_name>` | ASCII string | Valid directory | `INT:\` |

- **Returns (query):** Directory string in double quotes

```
MMEMory:CDIRectory "INT:\folder"
MMEMory:CDIRectory?    → "INT:\folder"
```

---

### 3.16.3 MMEMory:COPY

```
MMEMory:COPY "<file1>","<file2>"
```

Copies `<file1>` to `<file2>`. If `<file2>` is a path ending with `\`, the source filename is preserved. If `<file2>` includes a filename, the file is copied with that name. Overwrites existing files.

| Parameter | Type | Description |
|-----------|------|-------------|
| `<file1>` | ASCII string | Source file (must include extension) |
| `<file2>` | ASCII string | Destination path or filename |

```
MMEMory:COPY "INT:\Mysetup.sta","INT:\TextFolder\"
```

---

### 3.16.4 MMEMory:DELete

```
MMEMory:DELete "<file_name>"
```

Deletes the specified file. To delete a folder, use `MMEMory:RDIRectory`.

| Parameter | Type | Range |
|-----------|------|-------|
| `<file_name>` | ASCII string | Valid file path including extension |

```
MMEMory:DELete "INT:\screenshot.png"
```

---

### 3.16.5 MMEMory:LOAD:PREFerences

```
MMEMory:LOAD:PREFerences "<file>"
```

Loads nonvolatile I/O settings and user preferences from the specified file.

| Parameter | Type | Range |
|-----------|------|-------|
| `<file>` | ASCII string | Valid filename |

```
MMEMory:LOAD:PREFerences "INT:\MyPreferences"
```

---

### 3.16.6 MMEMory:LOAD:STATe

```
:MMEMory:LOAD:STATe "<file>"
```

Loads a previously saved instrument state from a `.sta` file.

| Parameter | Type | Range |
|-----------|------|-------|
| `<file>` | ASCII string | Valid `.sta` filename |

```
MMEMory:LOAD:STATe "INT:\Mystate.sta"
```

---

### 3.16.7 MMEMory:MDIRectory

```
MMEMory:MDIRectory "<dir_name>"
```

Creates a new empty folder in the specified location. Fails if a folder of the same name already exists.

| Parameter | Type | Range |
|-----------|------|-------|
| `<dir_name>` | ASCII string | New folder path |

```
MMEMory:MDIRectory "INT:\TestFolder"
```

---

### 3.16.8 MMEMory:MOVE

```
MMEMory:MOVE "<file1>","<file2>"
```

Moves or renames a file. If `<file2>` is a different folder, the file is moved. If it is a new filename in the same folder, the file is renamed.

| Parameter | Type | Description |
|-----------|------|-------------|
| `<file1>` | ASCII string | Source file |
| `<file2>` | ASCII string | Destination path or new filename |

```
MMEMory:MOVE "INT:\Rigol.sta","USB:\Rigol\"
MMEMory:MOVE "USB:\Rigol1.sta","USB:\Rigol2.sta"
```

---

### 3.16.9 MMEMory:RDIRectory

```
MMEMory:RDIRectory "<folder>"
```

Deletes the specified **empty** folder. Will fail if folder is not empty.

| Parameter | Type | Range |
|-----------|------|-------|
| `<folder>` | ASCII string | Empty folder path |

```
MMEMory:RDIRectory "INT:\TestFolder"
```

---

### 3.16.10 MMEMory:STORe:PREFerences

```
MMEMory:STORe:PREFerences "<file>"
```

Saves current nonvolatile I/O settings and user preferences to the specified file (`.prf`).

| Parameter | Type | Range |
|-----------|------|-------|
| `<file>` | ASCII string | Valid file path |

```
MMEMory:STORe:PREFerences "INT:\MyPreferences\set.prf"
```

---

### 3.16.11 MMEMory:STORe:STATe

```
MMEMory:STORe:STATe "<file>"
```

Saves current instrument state to a `.sta` file.

| Parameter | Type | Range |
|-----------|------|-------|
| `<file>` | ASCII string | Valid file path (extension added automatically) |

```
MMEMory:STORe:STATe "INT:\MySetup"
```

---

### 3.16.12 MMEMory:STORe:DATA

```
MMEMory:STORe:DATA RDG_STORE,"<file>"
```

Saves all readings from reading memory to the specified file. `.csv` or no extension = ASCII; `.dat` = binary. Overwrites existing files.

| Parameter | Type | Range |
|-----------|------|-------|
| `<file>` | ASCII string | Valid file path |

```
MMEMory:STORe:DATA RDG_STORE,"INT:\MyVoltMeas.csv"
```

---

### 3.16.13 MMEMory:STATe:RECall:AUTO

```
MMEMory:STATe:RECall:AUTO <bool>
MMEMory:STATe:RECall:AUTO?
```

Sets or queries whether the instrument restores its last-used state on power-up.

> - `1|ON` — instrument recalls the state from the last power-off on next startup.
> - `0|OFF` — instrument uses factory default values on startup (except parameters excluded from factory reset).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

```
MMEMory:STATe:RECall:AUTO ON
MMEMory:STATe:RECall:AUTO?    → 1
```

---

## 3.17 SENSe Commands

> `[SENSe]` is optional — the node can be omitted (e.g. `CAPacitance:RANGe` is equivalent to `SENSe:CAPacitance:RANGe`).

### 3.17.1 [SENSe]:CAPacitance:NULL[:STATe]

```
[SENSe]:CAPacitance:NULL[:STATe] <bool>
[SENSe]:CAPacitance:NULL[:STATe]?
```

Enables or disables the relative operation for capacitance.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:CAPacitance:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

```
SENSe:CAPacitance:NULL:STATe ON
SENSe:CAPacitance:NULL:STATe?    → 1
```

---

### 3.17.2 [SENSe]:CAPacitance:NULL:VALue

```
[SENSe]:CAPacitance:NULL:VALue {<value>|<lim>}
[SENSe]:CAPacitance:NULL:VALue?
```

Sets or queries the relative value for capacitance measurements.

> Range: −120% to +120% of the current capacitance measurement range (`[SENSe]:CAPacitance:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% of range | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:CAPacitance:NULL:VALue 1E-8
SENSe:CAPacitance:NULL:VALue?    → 1.00000000E-08
```

---

### 3.17.3 [SENSe]:CAPacitance:NULL:VALue:AUTO

```
[SENSe]:CAPacitance:NULL:VALue:AUTO <bool>
[SENSe]:CAPacitance:NULL:VALue:AUTO?
```

When enabled, the relative value is automatically set to the **first** capacitance measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:CAPacitance:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

```
SENSe:CAPacitance:NULL:VALue:AUTO ON
```

---

### 3.17.4 [SENSe]:CAPacitance:RANGe

```
[SENSe]:CAPacitance:RANGe {<range>|<lim>}
[SENSe]:CAPacitance:RANGe?
```

Sets or queries the capacitance measurement range. Setting a fixed range disables auto range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `1nF`\|`10nF`\|`100nF`\|`1μF`\|`10μF`\|`100μF`\|`1mF`\|`10mF`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (F)

```
SENSe:CAPacitance:RANGe 1E-3
SENSe:CAPacitance:RANGe?    → 1.00000000E-03
```

---

### 3.17.5 [SENSe]:CAPacitance:RANGe:AUTO

```
[SENSe]:CAPacitance:RANGe:AUTO <bool>
[SENSe]:CAPacitance:RANGe:AUTO?
```

Enables or disables auto range for capacitance.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:CAPacitance:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

```
SENSe:CAPacitance:RANGe:AUTO ON
```

---

### 3.17.6 [SENSe]:CAPacitance:SECondary

```
[SENSe]:CAPacitance:SECondary <second>
[SENSe]:CAPacitance:SECondary?
```

Sets or queries the secondary measurement function for capacitance.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` | `"OFF"` |

- `"CALCulate:DATA"` — raw reading before any math operations
- **Returns (query):** `"OFF"` or `"CALC:DATA"`

```
SENSe:CAPacitance:SECondary "CALCulate:DATA"
SENSe:CAPacitance:SECondary?    → "CALC:DATA"
```

---

### 3.17.7 [SENSe]:CURRent:AC:NULL[:STATe]

```
[SENSe]:CURRent:AC:NULL[:STATe] <bool>
[SENSe]:CURRent:AC:NULL[:STATe]?
```

Enables or disables the relative operation for AC current measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:CURRent:AC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.8 [SENSe]:CURRent:AC:NULL:VALue

```
[SENSe]:CURRent:AC:NULL:VALue {<value>|<lim>}
[SENSe]:CURRent:AC:NULL:VALue?
```

Sets or queries the relative value for AC current measurements.

> Range: −120% to +120% of the current AC current measurement range (`[SENSe]:CURRent:AC:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:CURRent:AC:NULL:VALue 1E-3
SENSe:CURRent:AC:NULL:VALue?    → 1.00000000E-03
```

---

### 3.17.9 [SENSe]:CURRent:AC:NULL:VALue:AUTO

```
[SENSe]:CURRent:AC:NULL:VALue:AUTO <bool>
[SENSe]:CURRent:AC:NULL:VALue:AUTO?
```

Enables or disables auto relative for AC current. When enabled, the relative value is set to the **first** AC current measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:CURRent:AC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.10 [SENSe]:CURRent:AC:RANGe

```
[SENSe]:CURRent:AC:RANGe {<range>|<lim>}
[SENSe]:CURRent:AC:RANGe?
```

Sets or queries the AC current measurement range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100μA`\|`1mA`\|`10mA`\|`100mA`\|`1A`\|`3A`\|`10A`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

> 3 A: DM858E only. 10 A: DM858 only.

- **Returns (query):** Range in scientific notation (A)

```
SENSe:CURRent:AC:RANGe 1
SENSe:CURRent:AC:RANGe?    → 1.00000000E+00
```

---

### 3.17.11 [SENSe]:CURRent:AC:RANGe:AUTO

```
[SENSe]:CURRent:AC:RANGe:AUTO <bool>
[SENSe]:CURRent:AC:RANGe:AUTO?
```

Enables or disables auto range for AC current.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:CURRent:AC:RANGe`. Disabled when a fixed range is set.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.12 [SENSe]:CURRent:AC:SECondary

```
[SENSe]:CURRent:AC:SECondary <second>
[SENSe]:CURRent:AC:SECondary?
```

Sets or queries the secondary measurement function for AC current.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` \| `"FREQuency"` \| `"PERiod"` | `"OFF"` |

- **Returns (query):** `"OFF"`, `"CALC:DATA"`, `"FREQ"`, or `"PER"`

```
SENSe:CURRent:AC:SECondary "FREQ"
SENSe:CURRent:AC:SECondary?    → "FREQ"
```

---

### 3.17.13 [SENSe]:CURRent:DC:NULL[:STATe]

```
[SENSe]:CURRent:DC:NULL[:STATe] <bool>
[SENSe]:CURRent:DC:NULL[:STATe]?
```

Enables or disables the relative operation for DC current measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:CURRent:DC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.14 [SENSe]:CURRent:DC:NULL:VALue

```
[SENSe]:CURRent:DC:NULL:VALue {<value>|<lim>}
[SENSe]:CURRent:DC:NULL:VALue?
```

Sets or queries the relative value for DC current measurements.

> Range: −120% to +120% of the current DC current measurement range (`[SENSe]:CURRent:DC:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:CURRent:DC:NULL:VALue 1E-3
SENSe:CURRent:DC:NULL:VALue?    → 1.00000000E-03
```

---

### 3.17.15 [SENSe]:CURRent:DC:NULL:VALue:AUTO

```
[SENSe]:CURRent:DC:NULL:VALue:AUTO <bool>
[SENSe]:CURRent:DC:NULL:VALue:AUTO?
```

Enables or disables auto relative for DC current. When enabled, the relative value is set to the **first** DC current measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:CURRent:DC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.16 [SENSe]:CURRent:DC:RANGe

```
[SENSe]:CURRent:DC:RANGe {<range>|<lim>}
[SENSe]:CURRent:DC:RANGe?
```

Sets or queries the DC current measurement range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100μA`\|`1mA`\|`10mA`\|`100mA`\|`1A`\|`3A`\|`10A`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (A)

```
SENSe:CURRent:DC:RANGe 1
SENSe:CURRent:DC:RANGe?    → 1.00000000E+00
```

---

### 3.17.17 [SENSe]:CURRent:DC:RANGe:AUTO

```
[SENSe]:CURRent:DC:RANGe:AUTO <bool>
[SENSe]:CURRent:DC:RANGe:AUTO?
```

Enables or disables auto range for DC current.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:CURRent:DC:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.18 [SENSe]:CURRent[:DC]:NPLC

```
[SENSe]:CURRent[:DC]:NPLC {<plc>|<lim>}
[SENSe]:CURRent[:DC]:NPLC?
```

Sets or queries the integration time in power-line cycles (PLCs) for DC current. The A/D converter samples the input for the full integration period — longer integration gives higher resolution but slower measurement.

> 1 PLC = 0.02 s. Setting NPLC also affects resolution — see resolution/integration time table.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<plc>` | Real | `0.4`\|`5`\|`20` | `20` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** PLC value in scientific notation

```
SENSe:CURRent:DC:NPLC 5
SENSe:CURRent:DC:NPLC?    → 5.00000000E+00
```

---

### 3.17.19 [SENSe]:CURRent[:DC]:RESolution

```
[SENSe]:CURRent[:DC]:RESolution {<resolution>|<lim>}
[SENSe]:CURRent[:DC]:RESolution?
```

Sets or queries the resolution for DC current measurements (unit: A).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<resolution>` | Real | See resolution table | 10 ppm × range |
| `<lim>` | Discrete | `MAX`\|`MIN`\|`DEF` | — |

- **Returns (query):** Resolution in scientific notation

---

### 3.17.20 [SENSe]:CURRent[:DC]:SECondary

```
[SENSe]:CURRent[:DC]:SECondary <second>
[SENSe]:CURRent[:DC]:SECondary?
```

Sets or queries the secondary measurement function for DC current.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` | `"OFF"` |

- **Returns (query):** `"OFF"` or `"CALC:DATA"`

---

### 3.17.21 [SENSe]:DATA2?

```
[SENSe]:DATA2?
```

Queries the secondary measurement results (requires a secondary function to be configured first).

- **Parameters:** None
- **Returns:** Secondary measurement value in scientific notation

```
SENSe:DATA2?    → -1.22110156E-03
```

---

### 3.17.22 [SENSe]:DATA2:CLEar[:IMMediate]

```
[SENSe]:DATA2:CLEar[:IMMediate]
```

Clears secondary measurement results and disables the secondary measurement function.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.17.23 [SENSe]:FREQuency:NULL[:STATe]

```
[SENSe]:FREQuency:NULL[:STATe] <bool>
[SENSe]:FREQuency:NULL[:STATe]?
```

Enables or disables the relative operation for frequency measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:FREQuency:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.24 [SENSe]:FREQuency:NULL:VALue

```
[SENSe]:FREQuency:NULL:VALue {<value>|<lim>}
[SENSe]:FREQuency:NULL:VALue?
```

Sets or queries the relative value for frequency measurements.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120 kHz to 120 kHz | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:FREQuency:NULL:VALue 1000
SENSe:FREQuency:NULL:VALue?    → 1.00000000E+03
```

---

### 3.17.25 [SENSe]:FREQuency:NULL:VALue:AUTO

```
[SENSe]:FREQuency:NULL:VALue:AUTO <bool>
[SENSe]:FREQuency:NULL:VALue:AUTO?
```

Enables or disables auto relative for frequency. When enabled, the relative value is set to the **first** frequency measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:FREQuency:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.26 [SENSe]:FREQuency:VOLTage:RANGe

```
[SENSe]:FREQuency:VOLTage:RANGe {<range>|<lim>}
[SENSe]:FREQuency:VOLTage:RANGe?
```

Sets or queries the input voltage range for frequency measurements.

> Use `[SENSe]:FREQuency:VOLTage:RANGe:AUTO` to re-enable auto ranging after setting a fixed range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`750V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (V)

```
SENSe:FREQuency:VOLTage:RANGe 1
SENSe:FREQuency:VOLTage:RANGe?    → 1.00000000E+00
```

---

### 3.17.27 [SENSe]:FREQuency:VOLTage:RANGe:AUTO

```
[SENSe]:FREQuency:VOLTage:RANGe:AUTO <bool>
[SENSe]:FREQuency:VOLTage:RANGe:AUTO?
```

Enables or disables voltage auto range for frequency measurements.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:FREQuency:VOLTage:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.28 [SENSe]:FREQuency:SECondary

```
[SENSe]:FREQuency:SECondary <second>
[SENSe]:FREQuency:SECondary?
```

Sets or queries the secondary measurement function for frequency.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` \| `"VOLTage:AC"` | `"OFF"` |

- **Returns (query):** `"OFF"`, `"CALC:DATA"`, or `"VOLT:AC"`

```
SENSe:FREQuency:SECondary "VOLTage:AC"
SENSe:FREQuency:SECondary?    → "VOLT:AC"
```

---

### 3.17.29 [SENSe]:FRESistance:NULL[:STATe]

```
[SENSe]:FRESistance:NULL[:STATe] <bool>
[SENSe]:FRESistance:NULL[:STATe]?
```

Enables or disables the relative operation for 4-wire resistance measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:FRESistance:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.30 [SENSe]:FRESistance:NULL:VALue

```
[SENSe]:FRESistance:NULL:VALue {<value>|<lim>}
[SENSe]:FRESistance:NULL:VALue?
```

Sets or queries the relative value for 4-wire resistance measurements.

> Range: −120% to +120% of the current 4-wire resistance measurement range (`[SENSe]:FRESistance:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:FRESistance:NULL:VALue 10
SENSe:FRESistance:NULL:VALue?    → 1.00000000E+01
```

---

### 3.17.31 [SENSe]:FRESistance:NULL:VALue:AUTO

```
[SENSe]:FRESistance:NULL:VALue:AUTO <bool>
[SENSe]:FRESistance:NULL:VALue:AUTO?
```

Enables or disables auto relative for 4-wire resistance. When enabled, the relative value is set to the **first** 4-wire resistance measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:FRESistance:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.32 [SENSe]:FRESistance:NPLC

```
[SENSe]:FRESistance:NPLC {<plc>|<lim>}
[SENSe]:FRESistance:NPLC?
```

Sets or queries the integration time in power-line cycles (PLCs) for 4-wire resistance. Longer integration gives higher resolution but slower measurement.

> 1 PLC = 0.02 s. Setting NPLC also affects resolution — see resolution/integration time table.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<plc>` | Real | `0.4`\|`5`\|`20` | `20` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** PLC value in scientific notation

```
SENSe:FRESistance:DC:NPLC 5
SENSe:FRESistance:DC:NPLC?    → 5.00000000E+00
```

---

### 3.17.33 [SENSe]:FRESistance:RANGe

```
[SENSe]:FRESistance:RANGe {<range>|<lim>}
[SENSe]:FRESistance:RANGe?
```

Sets or queries the range for 4-wire resistance measurements. Scientific notation accepted, e.g. `1E+3` = 1 kΩ.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100Ω`\|`1kΩ`\|`10kΩ`\|`100kΩ`\|`1MΩ`\|`10MΩ`\|`100MΩ`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (Ω)

```
SENSe:FRESistance:RANGe 100
SENSe:FRESistance:RANGe?    → 1.00000000E+02
```

---

### 3.17.34 [SENSe]:FRESistance:RANGe:AUTO

```
[SENSe]:FRESistance:RANGe:AUTO <bool>
[SENSe]:FRESistance:RANGe:AUTO?
```

Enables or disables auto range for 4-wire resistance.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:FRESistance:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.35 [SENSe]:FRESistance:RESolution

```
[SENSe]:FRESistance:RESolution {<resolution>|<lim>}
[SENSe]:FRESistance:RESolution?
```

Sets or queries the resolution for 4-wire resistance measurements (unit: Ω).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<resolution>` | Real | See resolution table | 10 ppm × range |
| `<lim>` | Discrete | `MAX`\|`MIN`\|`DEF` | — |

- **Returns (query):** Resolution in scientific notation

```
SENSe:FRESistance:RESolution 100
SENSe:FRESistance:RESolution?    → 1.00000000E+02
```

---

### 3.17.36 [SENSe]:FRESistance:SECondary

```
[SENSe]:FRESistance:SECondary <second>
[SENSe]:FRESistance:SECondary?
```

Sets or queries the secondary measurement function for 4-wire resistance.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` | `"OFF"` |

- **Returns (query):** `"OFF"` or `"CALC:DATA"`

---

### 3.17.37 [SENSe]:FUNCtion

```
[SENSe]:FUNCtion <function>
[SENSe]:FUNCtion?
```

Sets or queries the active measurement function.

| `<function>` value | Function |
|-------------------|----------|
| `"CAPacitance"` | Capacitance |
| `"CONTinuity"` | Continuity |
| `"CURRent:AC"` | AC current |
| `"CURRent[:DC]"` | DC current |
| `"DIODe"` | Diode |
| `"FREQuency"` | Frequency |
| `"FRESistance"` | 4-wire resistance |
| `"PERiod"` | Period |
| `"RESistance"` | 2-wire resistance |
| `"TEMPerature"` | Temperature |
| `"VOLTage:AC"` | AC voltage |
| `"VOLTage[:DC]"` | DC voltage |

- **Returns (query):** `"CAP"`, `"CONT"`, `"CURR:AC"`, `"CURR"`, `"DIOD"`, `"FREQ"`, `"FRES"`, `"PER"`, `"RES"`, `"TEMP"`, `"VOLT:AC"`, or `"VOLT"`

```
SENSe:FUNCtion "CURRent:AC"
SENSe:FUNCtion?    → "CURR:AC"
```

---

### 3.17.38 [SENSe]:PERiod:NULL[:STATe]

```
[SENSe]:PERiod:NULL[:STATe] <bool>
[SENSe]:PERiod:NULL[:STATe]?
```

Enables or disables the relative operation for period measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:PERiod:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.39 [SENSe]:PERiod:NULL:VALue

```
[SENSe]:PERiod:NULL:VALue {<value>|<lim>}
[SENSe]:PERiod:NULL:VALue?
```

Sets or queries the relative value for period measurements.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −60 ms to +60 ms | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:PERiod:NULL:VALue 1E-3
SENSe:PERiod:NULL:VALue?    → 1.00000000E-03
```

---

### 3.17.40 [SENSe]:PERiod:NULL:VALue:AUTO

```
[SENSe]:PERiod:NULL:VALue:AUTO <bool>
[SENSe]:PERiod:NULL:VALue:AUTO?
```

Enables or disables auto relative for period measurements. When enabled, the relative value is set to the **first** period measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:PERiod:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.41 [SENSe]:PERiod:VOLTage:RANGe

```
[SENSe]:PERiod:VOLTage:RANGe {<range>|<lim>}
[SENSe]:PERiod:VOLTage:RANGe?
```

Sets or queries the input voltage range for period measurements.

> Use `[SENSe]:PERiod:VOLTage:RANGe:AUTO` to re-enable auto ranging after setting a fixed range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`750V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (V)

```
SENSe:PERiod:VOLTage:RANGe 1
SENSe:PERiod:VOLTage:RANGe?    → 1.00000000E+00
```

---

### 3.17.42 [SENSe]:PERiod:VOLTage:RANGe:AUTO

```
[SENSe]:PERiod:VOLTage:RANGe:AUTO <bool>
[SENSe]:PERiod:VOLTage:RANGe:AUTO?
```

Enables or disables voltage auto range for period measurements.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:PERiod:VOLTage:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.43 [SENSe]:PERiod:SECondary

```
[SENSe]:PERiod:SECondary <second>
[SENSe]:PERiod:SECondary?
```

Sets or queries the secondary measurement function for period.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` \| `"VOLTage:AC"` | `"OFF"` |

- **Returns (query):** `"OFF"`, `"CALC:DATA"`, or `"VOLT:AC"`

---

### 3.17.44 [SENSe]:RESistance:NPLC

```
[SENSe]:RESistance:NPLC {<plc>|<lim>}
[SENSe]:RESistance:NPLC?
```

Sets or queries the integration time in power-line cycles (PLCs) for 2-wire resistance. Longer integration gives higher resolution but slower measurement.

> 1 PLC = 0.02 s. Setting NPLC also affects resolution — see resolution/integration time table.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<plc>` | Real | `0.4`\|`5`\|`20` | `20` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** PLC value in scientific notation

```
SENSe:RESistance:NPLC 5
SENSe:RESistance:NPLC?    → 5.00000000E+00
```

---

### 3.17.45 [SENSe]:RESistance:NULL[:STATe]

```
[SENSe]:RESistance:NULL[:STATe] <bool>
[SENSe]:RESistance:NULL[:STATe]?
```

Enables or disables the relative operation for 2-wire resistance measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:RESistance:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.46 [SENSe]:RESistance:NULL:VALue

```
[SENSe]:RESistance:NULL:VALue {<value>|<lim>}
[SENSe]:RESistance:NULL:VALue?
```

Sets or queries the relative value for 2-wire resistance measurements.

> Range: −120% to +120% of the current 2-wire resistance measurement range (`[SENSe]:RESistance:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:RESistance:NULL:VALue 100
SENSe:RESistance:NULL:VALue?    → 1.00000000E+02
```

---

### 3.17.47 [SENSe]:RESistance:NULL:VALue:AUTO

```
[SENSe]:RESistance:NULL:VALue:AUTO <bool>
[SENSe]:RESistance:NULL:VALue:AUTO?
```

Enables or disables auto relative for 2-wire resistance. When enabled, the relative value is set to the **first** 2-wire resistance measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:RESistance:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.48 [SENSe]:RESistance:RANGe

```
[SENSe]:RESistance:RANGe {<range>|<lim>}
[SENSe]:RESistance:RANGe?
```

Sets or queries the range for 2-wire resistance measurements.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100Ω`\|`1kΩ`\|`10kΩ`\|`100kΩ`\|`1MΩ`\|`10MΩ`\|`100MΩ`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (Ω)

```
SENSe:RESistance:RANGe 100
SENSe:RESistance:RANGe?    → 1.00000000E+02
```

---

### 3.17.49 [SENSe]:RESistance:RANGe:AUTO

```
[SENSe]:RESistance:RANGe:AUTO <bool>
[SENSe]:RESistance:RANGe:AUTO?
```

Enables or disables auto range for 2-wire resistance.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:RESistance:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.50 [SENSe]:RESistance:RESolution

```
[SENSe]:RESistance:RESolution {<resolution>|<lim>}
[SENSe]:RESistance:RESolution?
```

Sets or queries the resolution for 2-wire resistance measurements (unit: Ω).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<resolution>` | Real | See resolution table | 10 ppm × range |
| `<lim>` | Discrete | `MAX`\|`MIN`\|`DEF` | — |

- **Returns (query):** Resolution in scientific notation

```
SENSe:RESistance:RESolution 100
SENSe:RESistance:RESolution?    → 1.00000000E+02
```

---

### 3.17.51 [SENSe]:RESistance:SECondary

```
[SENSe]:RESistance:SECondary <second>
[SENSe]:RESistance:SECondary?
```

Sets or queries the secondary measurement function for 2-wire resistance.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` | `"OFF"` |

- **Returns (query):** `"OFF"` or `"CALC:DATA"`

---

### 3.17.52 [SENSe]:VOLTage:AC:NULL[:STATe]

```
[SENSe]:VOLTage:AC:NULL[:STATe] <bool>
[SENSe]:VOLTage:AC:NULL[:STATe]?
```

Enables or disables the relative operation for AC voltage measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:VOLTage:AC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.53 [SENSe]:VOLTage:AC:NULL:VALue

```
[SENSe]:VOLTage:AC:NULL:VALue {<value>|<lim>}
[SENSe]:VOLTage:AC:NULL:VALue?
```

Sets or queries the relative value for AC voltage measurements.

> Range: −120% to +120% of the current AC voltage measurement range (`[SENSe]:VOLTage:AC:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:VOLTage:AC:NULL:VALue 10
SENSe:VOLTage:AC:NULL:VALue?    → 1.00000000E+01
```

---

### 3.17.54 [SENSe]:VOLTage:AC:NULL:VALue:AUTO

```
[SENSe]:VOLTage:AC:NULL:VALue:AUTO <bool>
[SENSe]:VOLTage:AC:NULL:VALue:AUTO?
```

Enables or disables auto relative for AC voltage. When enabled, the relative value is set to the **first** AC voltage measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:VOLTage:AC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.55 [SENSe]:VOLTage:AC:RANGe

```
[SENSe]:VOLTage:AC:RANGe {<range>|<lim>}
[SENSe]:VOLTage:AC:RANGe?
```

Sets or queries the AC voltage measurement range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`750V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (V)

```
SENSe:VOLTage:AC:RANGe 1
SENSe:VOLTage:AC:RANGe?    → 1.00000000E+00
```

---

### 3.17.56 [SENSe]:VOLTage:AC:RANGe:AUTO

```
[SENSe]:VOLTage:AC:RANGe:AUTO <bool>
[SENSe]:VOLTage:AC:RANGe:AUTO?
```

Enables or disables auto range for AC voltage.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:VOLTage:AC:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.57 [SENSe]:VOLTage:AC:SECondary

```
[SENSe]:VOLTage:AC:SECondary <second>
[SENSe]:VOLTage:AC:SECondary?
```

Sets or queries the secondary measurement function for AC voltage.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` \| `"FREQuency"` \| `"PERiod"` | `"OFF"` |

- **Returns (query):** `"OFF"`, `"CALC:DATA"`, `"FREQ"`, or `"PER"`

```
SENSe:VOLTage:AC:SECondary "FREQ"
SENSe:VOLTage:AC:SECondary?    → "FREQ"
```

---

### 3.17.58 [SENSe]:VOLTage:DC:NULL[:STATe]

```
[SENSe]:VOLTage:DC:NULL[:STATe] <bool>
[SENSe]:VOLTage:DC:NULL[:STATe]?
```

Enables or disables the relative operation for DC voltage measurements.

> When enabled: reading = actual measurement − relative value. Set the relative value with `[SENSe]:VOLTage:DC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.17.59 [SENSe]:VOLTage:DC:NULL:VALue

```
[SENSe]:VOLTage:DC:NULL:VALue {<value>|<lim>}
[SENSe]:VOLTage:DC:NULL:VALue?
```

Sets or queries the relative value for DC voltage measurements.

> Range: −120% to +120% of the current DC voltage measurement range (`[SENSe]:VOLTage:DC:RANGe`).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Real | −120% to +120% | — |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Value in scientific notation

```
SENSe:VOLTage:DC:NULL:VALue 0.001
SENSe:VOLTage:DC:NULL:VALue?    → 1.00000000E-03
```

---

### 3.17.60 [SENSe]:VOLTage:DC:NULL:VALue:AUTO

```
[SENSe]:VOLTage:DC:NULL:VALue:AUTO <bool>
[SENSe]:VOLTage:DC:NULL:VALue:AUTO?
```

Enables or disables auto relative for DC voltage. When enabled, the relative value is set to the **first** DC voltage measurement reading.

> Auto relative is automatically disabled when a value is set manually via `[SENSe]:VOLTage:DC:NULL:VALue`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.61 [SENSe]:VOLTage:DC:RANGe

```
[SENSe]:VOLTage:DC:RANGe {<range>|<lim>}
[SENSe]:VOLTage:DC:RANGe?
```

Sets or queries the DC voltage measurement range.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<range>` | Discrete | `100mV`\|`1V`\|`10V`\|`100V`\|`1000V`\|`AUTO` | `AUTO` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Range in scientific notation (V)

```
SENSe:VOLTage:DC:RANGe 1
SENSe:VOLTage:DC:RANGe?    → 1.00000000E+00
```

---

### 3.17.62 [SENSe]:VOLTage:DC:RANGe:AUTO

```
[SENSe]:VOLTage:DC:RANGe:AUTO <bool>
[SENSe]:VOLTage:DC:RANGe:AUTO?
```

Enables or disables auto range for DC voltage.

> Auto range is automatically disabled when a fixed range is selected via `[SENSe]:VOLTage:DC:RANGe`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.17.63 [SENSe]:VOLTage[:DC]:NPLC

```
[SENSe]:VOLTage[:DC]:NPLC {<plc>|<lim>}
[SENSe]:VOLTage[:DC]:NPLC?
```

Sets or queries the integration time in power-line cycles (PLCs) for DC voltage. Longer integration gives higher resolution but slower measurement.

> 1 PLC = 0.02 s. Setting NPLC also affects resolution — see resolution/integration time table.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<plc>` | Real | `0.4`\|`5`\|`20` | `20` |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** PLC value in scientific notation

```
SENSe:VOLTage:DC:NPLC 5
SENSe:VOLTage:DC:NPLC?    → 5.00000000E+00
```

---

### 3.17.64 [SENSe]:VOLTage[:DC]:RESolution

```
[SENSe]:VOLTage[:DC]:RESolution {<resolution>|<lim>}
[SENSe]:VOLTage[:DC]:RESolution?
```

Sets or queries the resolution for DC voltage measurements (unit: V).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<resolution>` | Real | See resolution table | 10 ppm × range |
| `<lim>` | Discrete | `MAX`\|`MIN`\|`DEF` | — |

- **Returns (query):** Resolution in scientific notation

```
SENSe:VOLTage:DC:RESolution 1E-4
SENSe:VOLTage:DC:RESolution?    → 1.00000000E-04
```

---

### 3.17.65 [SENSe]:VOLTage[:DC]:SECondary

```
[SENSe]:VOLTage[:DC]:SECondary <second>
[SENSe]:VOLTage[:DC]:SECondary?
```

Sets or queries the secondary measurement function for DC voltage.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<second>` | Discrete | `"OFF"` \| `"CALCulate:DATA"` | `"OFF"` |

- **Returns (query):** `"OFF"` or `"CALC:DATA"`

```
SENSe:VOLTage:DC:SECondary "CALCulate:DATA"
SENSe:VOLTage:DC:SECondary?    → "CALC:DATA"
```

---

## 3.18 STATus Commands

> See Figure 3.1 (DM858/DM858E Status System) in the original manual for the full register flow diagram.

**Questionable Data Register bit definitions:**

| Bit | Decimal | Description |
|-----|---------|-------------|
| 0 | 1 | Voltage overload |
| 1 | 2 | Current overload |
| 2 | 4 | Sample timing violation |
| 4 | 16 | Temperature overload |
| 5 | 32 | Frequency overload |
| 8 | 256 | Calibration error |
| 9 | 512 | Resistance overload |
| 10 | 1024 | Capacitance overload |
| 11 | 2048 | Lower limit failed |
| 12 | 4096 | Upper limit failed |
| 14 | 16384 | Reading memory overflow |

**Operation Status Register bit definitions:**

| Bit | Decimal | Description |
|-----|---------|-------------|
| 0 | 1 | Calibrating |
| 4 | 16 | Measuring |
| 5 | 32 | Waiting for trigger |
| 8 | 256 | Configuration changed |
| 9 | 512 | Memory threshold reached |
| 10 | 1024 | Instrument locked |
| 13 | 8192 | Global error |

---

### 3.18.1 STATus:OPERation:CONDition?

```
STATus:OPERation:CONDition?
```

Queries the condition register of the Operation Status register.

> Read-only. Bits are **not cleared** when the register is read.

- **Parameters:** None
- **Returns:** Decimal sum of all set bits, e.g. `+32` (bit 5 = waiting for trigger)

```
STATus:OPERation:CONDition?    → +32
```

---

### 3.18.2 STATus:OPERation:ENABle

```
STATus:OPERation:ENABle <value>
STATus:OPERation:ENABle?
```

Sets or queries the enable register for the Operation Status register. Enabled bits propagate to the Status Byte register.

> `<value>` is the decimal-weighted sum of all bits to enable (e.g. bit 5 = 32, bit 9 = 512 → set 544). The enable register is cleared by `STATus:PRESet`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Integer | Decimal sum of bits | — |

- **Returns (query):** Integer

```
STATus:OPERation:ENABle 32
STATus:OPERation:ENABle?    → +32
```

---

### 3.18.3 STATus:OPERation[:EVENt]?

```
STATus:OPERation[:EVENt]?
```

Queries **and clears** the event register of the Operation Status register.

> Reading this register clears all bits in it.

- **Parameters:** None
- **Returns:** Decimal sum of set bits, e.g. `+32`

```
STATus:OPERation:EVENt?    → +32
```

---

### 3.18.4 STATus:PRESet

```
STATus:PRESet
```

Clears all bits in both the Operation Status enable register and the Questionable Data enable register.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.18.5 STATus:QUEStionable:CONDition?

```
STATus:QUEStionable:CONDition?
```

Queries the condition register of the Questionable Data register.

> Read-only. Bits are **not cleared** when the register is read.

- **Parameters:** None
- **Returns:** Decimal sum of set bits, e.g. `+4096` (bit 12 = upper limit failed)

```
STATus:QUEStionable:CONDition?    → +4096
```

---

### 3.18.6 STATus:QUEStionable:ENABle

```
STATus:QUEStionable:ENABle <value>
STATus:QUEStionable:ENABle?
```

Sets or queries the enable register for the Questionable Data register. Enabled bits propagate to the Status Byte register.

> `<value>` is the decimal-weighted sum of all bits to enable (e.g. bits 0+1+12 = 1+2+4096 = 4099). The enable register is cleared by `STATus:PRESet`.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<value>` | Integer | Decimal sum of bits | — |

- **Returns (query):** Integer

```
STATus:QUEStionable:ENABle 512
STATus:QUEStionable:ENABle?    → +512
```

---

### 3.18.7 STATus:QUEStionable[:EVENt]?

```
STATus:QUEStionable[:EVENt]?
```

Queries **and clears** the event register of the Questionable Data register.

> Reading this register clears all bits in it.

- **Parameters:** None
- **Returns:** Decimal sum of set bits, e.g. `+1024`

```
STATus:QUEStionable:EVENt?    → +1024
```

---

## 3.19 SYSTem Commands

### 3.19.1 SYSTem:BEEPer[:IMMediate]

```
SYSTem:BEEPer[:IMMediate]
```

Issues a single beep immediately.

- **Parameters:** None
- **Returns:** Nothing

```
SYSTem:BEEPer:IMMediate
```

---

### 3.19.2 SYSTem:BEEPer:STATe

```
SYSTem:BEEPer:STATe <bool>
SYSTem:BEEPer:STATe?
```

Enables or disables the beeper (touchscreen clicks and remote error alerts).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | — |

- **Returns (query):** `0` or `1`

```
SYSTem:BEEPer:STATe ON
SYSTem:BEEPer:STATe?    → 1
```

---

### 3.19.3 SYSTem:COMMunicate:LAN:AUToip

```
SYSTem:COMMunicate:LAN:AUToip <bool>
SYSTem:COMMunicate:LAN:AUToip?
```

Enables or disables Auto IP mode. In Auto IP mode, the instrument self-assigns an address in the 169.254.0.0/16 range.

> IP configuration priority: **DHCP > Auto IP > Static IP**. To use Auto IP, DHCP must be disabled first. All three modes cannot be turned off simultaneously. Must call `SYSTem:COMMunicate:LAN:UPDate` to apply changes.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.19.4 SYSTem:COMMunicate:LAN:CONTrol?

```
SYSTem:COMMunicate:LAN:CONTrol?
```

Queries the port number of the socket control connection (used for DCL and SRQ detection).

- **Parameters:** None
- **Returns:** Port number (e.g. `5025`); `0` if not supported

---

### 3.19.5 SYSTem:COMMunicate:LAN:DHCP

```
SYSTem:COMMunicate:LAN:DHCP <bool>
SYSTem:COMMunicate:LAN:DHCP?
```

Enables or disables DHCP mode. When active, the DHCP server assigns IP address, subnet mask, and default gateway automatically.

> IP configuration priority: **DHCP > Auto IP > Static IP**. All three modes cannot be turned off simultaneously. Must call `SYSTem:COMMunicate:LAN:UPDate` to apply changes.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `1`\|`ON` |

- **Returns (query):** `0` or `1`

---

### 3.19.6 SYSTem:COMMunicate:LAN:DNS

```
SYSTem:COMMunicate:LAN:DNS "<dns>"
SYSTem:COMMunicate:LAN:DNS?
```

Sets or queries the DNS server address (Static IP mode only). Format: `"nnn.nnn.nnn.nnn"`. Must call `UPDate` to apply.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<dns>` | ASCII string | Valid IPv4 address | — |

- **Returns (query):** Address string in double quotes

```
SYSTem:COMMunicate:LAN:DNS "172.16.3.2"
SYSTem:COMMunicate:LAN:DNS?    → "172.16.3.2"
```

---

### 3.19.7 SYSTem:COMMunicate:LAN:GATeway

```
SYSTem:COMMunicate:LAN:GATeway "<gateway>"
SYSTem:COMMunicate:LAN:GATeway?
```

Sets or queries the default gateway address (Static IP mode only). Must call `UPDate` to apply.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<gateway>` | ASCII string | Valid IPv4 address | — |

- **Returns (query):** Address string in double quotes

```
SYSTem:COMMunicate:LAN:GATeway "172.16.3.1"
SYSTem:COMMunicate:LAN:GATeway?    → "172.16.3.1"
```

---

### 3.19.8 SYSTem:COMMunicate:LAN:HOSTname

```
SYSTem:COMMunicate:LAN:HOSTname "<n>"
SYSTem:COMMunicate:LAN:HOSTname?
```

Sets or queries the mDNS hostname (max 15 chars, must start with A–Z, may contain letters, digits, and hyphens). Only valid when mDNS is enabled.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<n>` | ASCII string | Max 15 chars | — |

- **Returns (query):** Hostname string in double quotes

```
SYSTem:COMMunicate:LAN:HOSTname "RIGOL123"
SYSTem:COMMunicate:LAN:HOSTname?    → "RIGOL123"
```

---

### 3.19.9 SYSTem:COMMunicate:LAN:IPADdress

```
SYSTem:COMMunicate:LAN:IPADdress "<ip>"
SYSTem:COMMunicate:LAN:IPADdress?
```

Sets or queries the static IP address (Static IP mode only). Must call `UPDate` to apply.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<ip>` | ASCII string | Valid IPv4 address | — |

- **Returns (query):** Address string in double quotes

```
SYSTem:COMMunicate:LAN:IPADdress "169.254.149.35"
SYSTem:COMMunicate:LAN:IPADdress?    → "169.254.149.35"
```

---

### 3.19.10 SYSTem:COMMunicate:LAN:MAC?

```
SYSTem:COMMunicate:LAN:MAC?
```

Queries the MAC address of the instrument.

- **Parameters:** None
- **Returns:** MAC address string, e.g. `00:2A:A0:AA:E0:56`

```
SYSTem:COMMunicate:LAN:MAC?    → 00:2A:A0:AA:E0:56
```

---

### 3.19.11 SYSTem:COMMunicate:LAN:MANuip

```
SYSTem:COMMunicate:LAN:MANuip <bool>
SYSTem:COMMunicate:LAN:MANuip?
```

Enables or disables Static IP mode. In Static IP mode, all network parameters (IP, subnet, gateway) are set manually.

> IP configuration priority: **DHCP > Auto IP > Static IP**. To use Static IP, both DHCP and Auto IP must be disabled first. All three modes cannot be turned off simultaneously. Must call `SYSTem:COMMunicate:LAN:UPDate` to apply changes.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<bool>` | Bool | `0`\|`1`\|`OFF`\|`ON` | `0`\|`OFF` |

- **Returns (query):** `0` or `1`

---

### 3.19.12 SYSTem:COMMunicate:LAN:SMASk

```
SYSTem:COMMunicate:LAN:SMASk "<smask>"
SYSTem:COMMunicate:LAN:SMASk?
```

Sets or queries the subnet mask (Static IP mode only). Must call `UPDate` to apply.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<smask>` | ASCII string | Valid subnet mask | — |

- **Returns (query):** Mask string in double quotes

```
SYSTem:COMMunicate:LAN:SMASk "255.255.255.0"
SYSTem:COMMunicate:LAN:SMASk?    → "255.255.255.0"
```

---

### 3.19.13 SYSTem:COMMunicate:LAN:UPDate

```
SYSTem:COMMunicate:LAN:UPDate
```

Commits all pending LAN configuration changes to non-volatile memory and restarts the LAN driver. Must be called after any LAN setting change (DHCP, DNS, gateway, IP, subnet mask).

> **Important:** Complete **all** LAN configuration changes before sending this command. The LAN interface restarts immediately on receipt.

- **Parameters:** None
- **Returns:** Nothing

---

### 3.19.14 SYSTem:DATE

```
SYSTem:DATE <year>,<month>,<day>
SYSTem:DATE?
```

Sets or queries the real-time clock date (used for file timestamps in MMEMory).

| Parameter | Type | Range |
|-----------|------|-------|
| `<year>` | Integer | 2000–2100 |
| `<month>` | Integer | 1–12 |
| `<day>` | Integer | 1–31 |

- **Returns (query):** String, e.g. `+2023,+07,+26`

```
SYSTem:DATE 2023,7,26
SYSTem:DATE?    → +2023,+07,+26
```

---

### 3.19.15 SYSTem:ERRor?

```
SYSTem:ERRor?
```

Retrieves and removes the oldest error from the error queue.

> - Errors are retrieved in **FIFO order** (oldest first).
> - Up to 20 errors are queued. If more than 20 occur, the last queue slot is replaced with `-350,"Error queue overflow"`; no further errors are stored until the queue is drained.
> - The queue is cleared by `*CLS` or a power cycle. **`*RST` does not clear the error queue.**

- **Parameters:** None
- **Returns:** `<code>,"<message>"`, e.g. `-224,"Illegal parameter value"` or `+0,"No error"`

---

### 3.19.16 SYSTem:TIME

```
SYSTem:TIME <hour>,<minute>,<second>
SYSTem:TIME?
```

Sets or queries the real-time clock time (used for file timestamps in MMEMory).

| Parameter | Type | Range |
|-----------|------|-------|
| `<hour>` | Integer | 0–23 |
| `<minute>` | Integer | 0–59 |
| `<second>` | Integer | 0–60 |

- **Returns (query):** String, e.g. `20,15,30`

```
SYSTem:TIME 20,15,30
SYSTem:TIME?    → 20,15,30
```

---

### 3.19.17 SYSTem:VERSion?

```
SYSTem:VERSion?
```

Queries the current SCPI standard version implemented by the instrument.

- **Parameters:** None
- **Returns:** Version string in `"YYYY.V"` format, e.g. `1999.0`

```
SYSTem:VERSion?    → 1999.0
```

---

## 3.20 TRIGger Commands

### 3.20.1 TRIGger:COUNt

```
TRIGger:COUNt {<count>|<lim>}
TRIGger:COUNt?
```

Sets or queries the number of triggers accepted in Single (Bus) trigger mode. Total readings = `TRIGger:COUNt` × `SAMPle:COUNt`.

> **Restrictions:**
> - Only valid when `TRIGger:SOURce` is set to Single (`BUS`) trigger. Ignored in `IMMediate` and `EXTernal` modes.
> - Can only be set in **remote mode** (not from the front panel).

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<count>` | Integer | 1–1000 | 1 |
| `<lim>` | Discrete | `MIN`\|`MAX`\|`DEF` | — |

- **Returns (query):** Integer

```
TRIGger:COUNt 50
TRIGger:COUNt?    → 50
```

---

### 3.20.2 TRIGger:SOURce

```
TRIGger:SOURce <source>
TRIGger:SOURce?
```

Sets or queries the trigger source. The instrument must be in wait-for-trigger state (via `INITiate` or `READ?`) before a trigger is accepted.

| Parameter | Type | Range | Default |
|-----------|------|-------|---------|
| `<source>` | Discrete | `IMMediate`\|`BUS`\|`EXTernal` | `IMMediate` |

- `IMMediate` — triggers immediately when in wait-for-trigger state
- `BUS` — triggered by `*TRG` command
- `EXTernal` — triggered by signal on rear-panel `[EXT TRIG]` connector
- **Returns (query):** `IMM`, `BUS`, or `EXT`

```
TRIGger:SOURce BUS
TRIGger:SOURce?    → BUS
```
