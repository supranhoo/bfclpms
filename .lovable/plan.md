

## Round the Amount Column in Production Daily Grid

### Problem
The "Amount (₹)" column in the Incentive Data Entry → Production Daily Grid shows unrounded decimal values (e.g., ₹5,022.675 and ₹2,630.925 as seen in the screenshot). These should be rounded to whole numbers for cleaner display.

### Current vs Expected

```text
BEFORE                          AFTER
Amount (₹)                      Amount (₹)
₹5,022.675                      ₹5,023
₹2,630.925                      ₹2,631
```

### Implementation

**`src/components/incentive/ProductionDailyGrid.tsx`** (line 242, 266)
- Change `const amount = total * effectiveRate;` → `const amount = Math.round(total * effectiveRate);`
- The display line (`₹{amount.toLocaleString('en-IN')}`) already handles formatting — rounding the value is sufficient

**`src/components/incentive/IncentiveDataExport.tsx`** (line 145)
- Round the exported amount as well: `row['Amount (₹)'] = Math.round(total * rate);`

**Documentation** — Version bump in `DOCUMENTATION.md` and `POLICY.md`.

### Risk Assessment
- **Data impact**: None — display-only rounding, no DB changes
- **Regression risk**: Minimal — `Math.round` on a computed display value
- **UI/UX**: Cleaner currency display matching standard payroll conventions

