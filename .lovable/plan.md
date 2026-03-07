

# Plan: Fix Bulk Apply to Span Fiscal Year Boundary

## Problem Identified
The "Apply to All months" bulk apply feature only queries siblings within the same **calendar year** (`.eq('review_year', kpi.review_year)`). However, the PMS operates on a **fiscal year** (July–June), so a KPI like "Power generation from 45 MWh/AFBC" spans two calendar years:
- **2025**: October, November, December  
- **2026**: January, February, March

When the admin edits a November 2025 KPI and selects "All months", only October and December 2025 are found as siblings — January through March 2026 are missed because they have `review_year = 2026`.

### Evidence from Database
- Jitendra Kumar Dwivedi has 6 months of this KPI: Oct/Nov/Dec 2025 + Jan/Feb/Mar 2026
- All 6 months still show `r0: null` — no bulk apply audit logs exist for this employee
- The only successful bulk apply was for Bhoopendra (Feb→Mar 2026, same calendar year)

## Fix

### File: `src/components/admin/AdminKpiEditDialog.tsx`

**Change the sibling query** (line 175-182) to search across both years of the fiscal year instead of just the current `review_year`:

```text
Current:  .eq('review_year', kpi.review_year)

Fix:      .in('review_year', [fiscalYearStart, fiscalYearStart + 1])
          // where fiscalYearStart is derived from the KPI's month
          // July–Dec → review_year is the fiscal start
          // Jan–June → review_year - 1 is the fiscal start
```

**Update the "future months" filter** to also work across fiscal year boundaries using a fiscal-aware month ordering (July=0 through June=11).

**Update UI labels** (lines 716, 722) to show the fiscal year range instead of just the calendar year:
- "All future months (same fiscal year, after November)" 
- "All months (fiscal year 2025-26)"

### Detailed Logic

```typescript
// Determine fiscal year span
const FISCAL_MONTHS = ['July','August','September','October','November','December',
                       'January','February','March','April','May','June'];

const monthIndex = MONTHS.indexOf(kpi.review_period); // calendar index
const isSecondHalf = monthIndex >= 6; // July-Dec
const fiscalStartYear = isSecondHalf ? kpi.review_year : kpi.review_year - 1;
const fiscalYears = [fiscalStartYear, fiscalStartYear + 1];

// Query siblings across both years of the fiscal year
let query = supabase
  .from('kpis')
  .select('id, review_period, review_year')
  .eq('employee_id', kpi.employee_id)
  .eq('kra_name', kpi.kra_name)  
  .eq('kpi_name', kpi.kpi_name)
  .in('review_year', fiscalYears)
  .neq('id', kpi.id);

// For "future_months" filter, use fiscal ordering
const getFiscalIndex = (month: string) => FISCAL_MONTHS.indexOf(month);
const currentFiscalIdx = getFiscalIndex(kpi.review_period);

const filteredSiblings = siblings.filter(s => {
  const sibFiscalIdx = getFiscalIndex(s.review_period);
  if (applyScope === 'future_months') {
    // Compare by fiscal position, accounting for year
    const sibIsLaterYear = s.review_year > kpi.review_year;
    const sibIsSameYearLaterMonth = s.review_year === kpi.review_year 
      && MONTHS.indexOf(s.review_period) > monthIndex;
    return sibIsLaterYear || sibIsSameYearLaterMonth;
  }
  return true; // all_months
});
```

## Risk Assessment
- **Data Impact**: None — only broadens the search scope for siblings. Same structural fields propagate.
- **Regression Risk**: Low — "This month only" (default) is unchanged. The fix only affects the sibling query when a broader scope is selected.
- **Backward Compatibility**: Existing behavior for KPIs within the same calendar year is preserved; this just adds coverage for the cross-year fiscal boundary.

