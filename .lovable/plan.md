

# Plan: Fix "Submit Month" Button Not Visible for Employees

## Root Cause Analysis

After thorough investigation, I found the issue is a **race condition / loading state problem**:

### Data Flow
1. `kpis` loads from `useMyKpis()`
2. `kpiIds` is derived from `kpis`
3. `subPeriodSubmissions` loads from `useSubPeriodSubmissionsByKpis(kpiIds, ...)` - **depends on kpiIds**
4. When user opens review sheet, `selectedKpiSubPeriods` is computed from `subPeriodSubmissions`

### The Problem
If the user opens the review sheet **before** `subPeriodSubmissions` finishes loading:
- `subPeriodSubmissions` is `undefined` or empty array initially
- `selectedKpiSubPeriods.length === 0` evaluates to `true`
- The **disabled** button with tooltip is shown instead of the enabled button

Even after data loads, the button might not update properly because:
1. The `selectedKpiSubPeriods` useMemo depends on `[selectedKpi, subPeriodSubmissions]`
2. If `subPeriodSubmissions` was undefined when the sheet opened, it returns `[]`

### Database Confirmation
Database shows entries exist:
```
kpi_id: 45e6a59c-7b22-40b5-9074-b5e784939379
review_month: January, review_year: 2026
sub_period_value: 2026-01-31, 2026-01-30
achieved_value: null (entries saved without values)
```

## Proposed Solution

### Fix 1: Handle Loading State
Add a loading indicator for when sub-period data is still being fetched.

### Fix 2: Fix Dependency Issue
Ensure `getKpiSubPeriodSubmissions` is properly memoized and included in dependencies.

### Fix 3: Consider Entries with NULL Values
Currently `selectedKpiSubPeriods` includes ALL entries (even with null values). This is correct for showing the button - but we should also validate against entries with actual values for enabling submission.

## Implementation

### Changes to `src/pages/MyKpis.tsx`

**1. Add loading state check for sub-period data** (around line 142)

```typescript
// Add isLoading state from the hook
const { data: subPeriodSubmissions, isLoading: subPeriodLoading } = useSubPeriodSubmissionsByKpis(kpiIds, selectedPeriod, selectedYear);
```

**2. Fix the memoized helper function** (around line 176-179)

The current implementation has a stale closure issue. The `getKpiSubPeriodSubmissions` function is defined inside the component but not memoized, so it captures `subPeriodSubmissions` at a specific point.

```typescript
// Wrap in useCallback to ensure fresh data
const getKpiSubPeriodSubmissions = useCallback((kpiId: string) => {
  return subPeriodSubmissions?.filter(s => s.kpi_id === kpiId) || [];
}, [subPeriodSubmissions]);
```

**3. Update useMemo dependency** (lines 182-184)

```typescript
const selectedKpiSubPeriods = useMemo(() => {
  return selectedKpi ? getKpiSubPeriodSubmissions(selectedKpi.id) : [];
}, [selectedKpi, getKpiSubPeriodSubmissions]);
```

**4. Add loading state to button rendering** (around line 1264-1306)

Show a loading state while data is being fetched:

```typescript
{needsSubPeriodForKpi && (
  <>
    {subPeriodLoading ? (
      <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </Button>
    ) : selectedKpiSubPeriods.length === 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
              <Send className="h-3 w-3" />
              Submit Month
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Enter at least one {selectedKpi?.frequency?.toLowerCase()} value first
        </TooltipContent>
      </Tooltip>
    ) : selectedKpi?.status !== 'kra_set' ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
              <Send className="h-3 w-3" />
              Month Submitted
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          This KPI has already been submitted for the month
        </TooltipContent>
      </Tooltip>
    ) : (
      <Button 
        size="sm"
        onClick={() => setShowMonthlySubmitConfirm(true)}
        className="gap-1"
        disabled={isSubmittingMonthly}
      >
        <Send className="h-3 w-3" />
        Submit Month
      </Button>
    )}
  </>
)}
```

**5. Add Loader2 import** (line 38)

```typescript
import { Target, TrendingUp, CheckCircle2, Clock, Send, Eye, AlertCircle, BarChart3, Building2, Lock, Users, User, FileCheck, Calendar, AlertTriangle, Loader2 } from 'lucide-react';
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Fix loading state, memoization, and button rendering |
| `DOCUMENTATION.md` | Update button visibility documentation |

## Visual Summary

| Scenario | Current | Fixed |
|----------|---------|-------|
| Data loading | Shows disabled "Submit Month" | Shows "Loading..." |
| No entries | Disabled with tooltip | (same) |
| Has entries, status=kra_set | Button enabled | (same, but now works) |
| Already submitted | "Month Submitted" disabled | (same) |

## Testing Checklist

1. Go to My KPIs page (`/my-kpis`)
2. Open a Daily KPI in `kra_set` status
3. Verify loading state appears briefly
4. Verify "Submit Month" button is visible and enabled after data loads
5. Click Submit Month and verify confirmation dialog
6. Complete submission and verify status changes to `self_review`

