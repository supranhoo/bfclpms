
# Plan: Fix Daily KPI Achieved Value and "No" Count Issues

## Problem Summary

Two related issues were identified in the Daily KPI "View KPI Details" sheet:

| Issue | Root Cause |
|-------|------------|
| Achieved Value shows "—" | Binary/Tiered values saved as `null` instead of rating number |
| "No" Count always shows 0 | Since values are `null`, filter for `achieved_value === 0` never matches |

## Root Cause Analysis

### Data Flow Comparison

**DailySubmissionGrid.tsx (Works Correctly):**
```typescript
// Line 174-176
const value = isQualitative 
  ? tempRating        // Uses numeric rating (0 or 5)
  : (tempValue ? parseFloat(tempValue) : null);
```

**MyKpis.tsx (Bug):**
```typescript
// Line 446
achieved_value: isNa ? null : (parseFloat(achievedValue) || null),
// achievedValue = "Yes" or "No" (string)
// parseFloat("Yes") = NaN
// NaN || null = null ← Always saves null!
```

### Database Evidence

All recent sub-period submissions have `achieved_value: null`:
```
kpi_id: f1efbaf6-1cd0-452c-b81f-d33bbe981fde (binary KPI)
achieved_value: null (should be 0 or 5)
```

## Solution

### Changes to `src/pages/MyKpis.tsx`

**1. Modify `performSubPeriodSubmit` function (around line 446)**

Add logic to handle qualitative KPIs by using `calculatedScore` (the numeric rating) instead of parsing the string label:

```typescript
// Before (Bug)
achieved_value: isNa ? null : (parseFloat(achievedValue) || null),

// After (Fixed)
achieved_value: isNa 
  ? null 
  : isQualitativeKpi(selectedKpi) 
    ? calculatedScore  // Use the numeric rating for binary/tiered
    : (parseFloat(achievedValue) || null),
```

This mirrors the fix already present in the regular review submission (line 513):
```typescript
achieved_value: isNa ? null : (isQualitativeKpi(selectedKpi) ? calculatedScore : (parseFloat(achievedValue) || 0)),
```

### Visual Example

After fix, for a Binary KPI:

| User Selects | `achievedValue` | `calculatedScore` | Saved `achieved_value` |
|--------------|-----------------|-------------------|------------------------|
| "Yes" | "Yes" | 5 | 5 |
| "No" | "No" | 0 | 0 |

### Impact on "No" Count

Once values are correctly saved as `0` for "No" selections:
- `submissions.filter(s => s.achieved_value === 0).length` will correctly count "No" entries
- The "No" count stat card in DailySubmissionSummary will display accurate data

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/MyKpis.tsx` | Fix `performSubPeriodSubmit` to use `calculatedScore` for qualitative KPIs |
| `DOCUMENTATION.md` | Add note about binary/tiered value storage format |

## Testing Checklist

1. Navigate to My KPIs page
2. Open a **Daily Binary KPI** (e.g., "Aaj kam kiya kya")
3. Select a date and choose "Yes" → Save → Verify value saved as 5 in summary
4. Select another date and choose "No" → Save → Verify value saved as 0
5. Check "No" count stat card shows correct count
6. Open "View KPI Details" and verify Achieved Value column shows "Yes"/"No" labels correctly
7. Test with a tiered KPI to ensure same behavior

## Data Migration (Optional)

Existing submissions with `null` values will remain unchanged. Users would need to re-enter those values. If this is a concern, a SQL update could be run to fix historical data, but this requires knowing what the user actually selected (which isn't stored elsewhere).
