

# Fix Excel Percentage Import Bug (Values > 100%)

## Root Cause

When Excel formats a cell as "percentage", the XLSX library delivers values as **decimals** (e.g., 102% arrives as `1.02`, 150% arrives as `1.5`). The import code correctly handles decimals in the 0-1 range (0% to 100%) by multiplying by 100, but **fails for values above 100%** because the check uses `<= 1`.

This bug affects **three places** in the import function, causing:
- **target_value**: 102% stored as 1.02 instead of 102
- **R4/R5 thresholds**: 102% stored as "1.02%" instead of "102%"  
- **achieved_value**: Same issue for submitted achieved values > 100%

**98 KPI records** are currently affected in the database.

## Fix Plan (2 parts)

### Part 1: Fix the Import Code

**File: `supabase/functions/import-kpis/index.ts`**

Three changes:

1. **Target value conversion (line 694)**: Change `targetValue <= 1` to `targetValue <= 2` so values up to 200% (arriving as 2.0) are correctly multiplied by 100.

2. **`formatRatingThreshold` -- %-sign branch (lines 328-334)**: When the string already includes "%" but the numeric part is suspiciously small (e.g., "1.02%"), detect this as an Excel artifact and multiply by 100. Add a check: if `numPart > 0 && numPart <= 2`, treat it as a decimal and convert (`1.02%` becomes `102%`).

3. **`parseAchieved` function (line 838)**: Change `num <= 1` to `num <= 2` so achieved values like 1.02 (representing 102%) are correctly converted.

### Part 2: Fix Existing Data in Database

Provide a SQL migration to correct all 98 affected records:

- **target_value**: Multiply by 100 where `uom = '%' AND target_value > 1 AND target_value <= 2`
- **R4 and R5 thresholds**: Parse the numeric part from strings like "1.02%", multiply by 100, and store as "102%"
- No R1/R2/R3 records are affected (they are all <= 100%)

### Part 3: Update Documentation

**File: `DOCUMENTATION.md`** -- Add a note about the Excel percentage handling and the `<= 2` heuristic for values up to 200%.

---

## Technical Details

### Why `<= 2` and not a higher threshold?

The decimal 2.0 represents 200% in Excel format. Percentages above 200% are extremely rare in KPI systems. Using `<= 2` provides safe coverage without false positives (a KPI with a genuine target of 1.5 in non-percentage UOM would not be affected since the check only applies when `uom = '%'`).

### SQL Correction Query

```text
-- Fix target_value
UPDATE kpis SET target_value = target_value * 100 
WHERE uom = '%' AND target_value > 1 AND target_value <= 2;

-- Fix R4 thresholds like "1.02%"
UPDATE kpis SET r4 = CONCAT(ROUND(CAST(REPLACE(r4, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r4 LIKE '1.%' AND CAST(REPLACE(r4, '%', '') AS NUMERIC) <= 2;

-- Fix R5 thresholds like "1.5%"  
UPDATE kpis SET r5 = CONCAT(ROUND(CAST(REPLACE(r5, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r5 LIKE '1.%' AND CAST(REPLACE(r5, '%', '') AS NUMERIC) <= 2;
```

### Affected Ref Codes (from user's list)

The r4/r5 columns for all the REF codes the user listed (REF-2856, REF-2839, REF-2736, REF-2302, etc.) will be corrected from values like "1.02%" to "102%", and target_value from 1.02 to 102.

