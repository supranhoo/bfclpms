

# Fix: Stop Converting R5-R0 Thresholds to Percentages for Non-Percentage UOMs

## Problem

When importing KPIs with UOM = "Days" (or Number, Hours, etc.), the R5-R0 threshold values are being incorrectly converted to percentage strings. For example, if you upload R5=3, R4=5, R3=7 for a "Days" KPI with target=5, they get stored as "300%", "500%", "700%" instead of "3", "5", "7".

**Root cause** -- two locations:

1. **Edge function** (`supabase/functions/import-kpis/index.ts`, line 701): The threshold mode decision is based solely on whether the target is zero:
   ```
   thresholdMode = targetValue === 0 ? 'absolute' : 'percentage'
   ```
   Any KPI with a non-zero target gets percentage conversion, regardless of UOM.

2. **Frontend foreground** (`src/pages/admin/ImportData.tsx`, lines 374-402): The `formatRatingThreshold` function blindly converts any value between 0-100 into a percentage string (e.g., 5 becomes "5%"), with no awareness of the KPI's UOM.

## Fix

### 1. Edge function (`supabase/functions/import-kpis/index.ts`)

Change the threshold mode logic to treat **only** percentage UOMs as percentage mode. All other UOMs (Days, Number, Hours, Minutes, Amount, Date, Index, Ratio, Score, Count, Rate) use absolute mode:

```typescript
// Before (broken):
const thresholdMode = targetValue === 0 ? 'absolute' : 'percentage';

// After (fixed):
const isPercentageUom = uom === '%' || uom?.toLowerCase() === 'percentage';
const thresholdMode = isPercentageUom ? 'percentage' : 'absolute';
```

### 2. Frontend foreground (`src/pages/admin/ImportData.tsx`)

Make `formatRatingThreshold` UOM-aware. Pass the row's UOM into the function; if UOM is not percentage, store the value as a plain number string without any percentage conversion:

```typescript
const formatRatingThreshold = (value: any, uom?: string): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const strValue = String(value).trim();
  
  const isPercentageUom = uom === '%' || uom?.toLowerCase() === 'percentage';
  
  // For non-percentage UOMs, store as plain number
  if (!isPercentageUom) {
    if (strValue.includes('%')) return strValue.replace('%', '');
    return strValue;
  }
  
  // Existing percentage conversion logic for % UOM...
};
```

Update all calls to `formatRatingThreshold` (lines 517-522) to pass the row's UOM value.

### 3. Documentation (`DOCUMENTATION.md`)

Note that threshold values are stored as absolute numbers for all non-percentage UOMs and only converted to percentage strings when UOM is explicitly "%".

