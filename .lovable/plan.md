

# Always Show All Score Columns + Final in KPI Details Table

## Problem
Currently, the KPI Details table progressively shows score columns (Self, Manager, Auditor, Mgmt) based on each KPI's status. The user wants all 4 columns **always visible** plus a new **Final** column, matching the reference screenshot.

## Changes

**File:** `src/components/review/KpiDetailsTable.tsx`

1. **Remove progressive column logic** -- delete `getVisibleScoreColumns` and `getMaxVisibleColumns` functions
2. **Always render all 5 score columns**: Self, Manager, Auditor, Mgmt, Final
3. **Add `final_score`** to `getScoreForColumn` function
4. **Update `totalColumns`** count to reflect the fixed 5 score columns (Category + KRA/KPI + Target + Weightage + 5 scores + Status + Actions = 12)

### Column definitions (hardcoded, no longer dynamic)
```
Self       -> submission.self_score
Manager    -> submission.manager_score
Auditor    -> submission.auditor_score
Mgmt       -> submission.management_score
Final      -> submission.final_score
```

All columns always show a dash (--) when no score exists, keeping the layout consistent.

**File:** `DOCUMENTATION.md` -- update the KPI Details table description to note all 5 score columns are always visible plus Final.

