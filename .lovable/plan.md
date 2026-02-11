

# Fix: Manager Cannot See Dummy's Submitted Review

## Root Cause

The system defaults the period selector to **February 2026** (current month), but Dummy's submitted KPI is for **January 2026**. When the manager clicks on Dummy, the `UnifiedScorecard` filters KPIs by the selected period -- showing 0 results for February.

The architecture (RLS policies, hooks, components) is all correct. This is purely a **period mismatch** problem.

## Solution

Auto-detect the most relevant period when a manager selects an employee, and add a visual hint when no KPIs exist for the current period but do exist for other periods.

### Changes

**1. `src/components/review/EmployeeSelectorGrid.tsx` -- Smart period detection on employee click**

When a user clicks an employee card, check if that employee has KPIs in the currently selected period. If not, find the most recent period with pending/reviewable KPIs and auto-switch to it.

- In `onSelectEmployee` handler, look up the employee's KPIs from `periodKpis`
- If the employee has no KPIs in the current period, query for their most recent period with reviewable KPIs
- Auto-update `periodSelection` to match before navigating to the scorecard

**2. `src/components/review/UnifiedScorecard.tsx` -- "No KPIs" hint with period suggestion**

When the scorecard shows 0 KPIs for the selected period, display a helpful message:
- "No KPIs found for February 2026"
- If KPIs exist in other periods, show: "This employee has KPIs in January 2026" with a "Switch to January" button

This requires a lightweight query to check which periods have KPIs for the employee.

**3. `src/hooks/useKpis.ts` -- Add `useEmployeeKpiPeriods` hook**

A new hook that fetches distinct `(review_period, review_year, status)` combinations for a given employee. This is used by the scorecard to suggest alternate periods.

```sql
SELECT DISTINCT review_period, review_year, status
FROM kpis
WHERE employee_id = $1
ORDER BY review_year DESC, review_period DESC
```

**4. Update `DOCUMENTATION.md`**

Document the smart period detection behavior.

## File Summary

| File | Action |
|---|---|
| `src/hooks/useKpis.ts` | Add `useEmployeeKpiPeriods` hook |
| `src/components/review/EmployeeSelectorGrid.tsx` | Auto-switch period on employee click |
| `src/components/review/UnifiedScorecard.tsx` | Add "no KPIs" hint with period suggestion |
| `DOCUMENTATION.md` | Update docs |

