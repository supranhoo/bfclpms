

## RCA: Previous Months Showing Current Workflow Instead of Historical Workflow

### Root Cause

**Parameter name mismatch in RPC call.** In `KpiJourneySection.tsx` (line 187-191), the code calls `get_bulk_employee_workflows` with parameters named `p_review_periods` (plural, array) and `p_review_years` (plural, array). However, the database function only accepts `p_review_period` (singular, TEXT) and `p_review_year` (singular, INTEGER).

PostgREST silently ignores unknown parameters, so the function executes with `NULL` period/year — which skips all period-specific workflow lookups and falls back to the **current global/default workflow template**. This means employee 100482's Jan and Feb previous months show the current `self_l1_audit` workflow (with Auditor tile) instead of the `self_l1_hr_pms` workflow (with HR PMS tile) that was active when those months were actually reviewed.

**This affects every employee whose workflow was changed after their old months were reviewed** — the Previous Months section always shows the current workflow instead of the historical one.

### Impact

Every "Previous Months" tile in the Review Journey for any employee who has had a workflow change will display incorrect reviewer stages. The screenshot shows employee 100482 displaying an "Auditor" tile for Jan and Feb 2026, even though those months were reviewed under a workflow that had HR PMS as the terminal reviewer.

### Fix — 2 parts

#### Part 1: Fix RPC Call — Fetch Workflow Per Period Individually

The existing `get_bulk_employee_workflows` RPC accepts a single period+year, not arrays. The fix is to call the RPC once per previous month period, then merge results into the workflow map.

In `KpiJourneySection.tsx`, replace the single RPC call (lines 187-198) with a loop that calls the RPC for each unique period:

```text
For each previous month period:
  Call get_bulk_employee_workflows({
    employee_ids: [kpi.employee_id],
    p_review_period: period.month,   // singular
    p_review_year: period.year       // singular
  })
  Store result in wfMap keyed by "month_year"
```

This ensures each previous month resolves the workflow that was configured for that specific period, not the current one.

#### Part 2: Documentation

| File | Change |
|------|--------|
| `src/components/review/KpiJourneySection.tsx` | Fix RPC call to use correct singular param names per period |
| `DOCUMENTATION.md` | Version bump with fix note |

### Risk Assessment
- **No data migration needed**: This is a display-only bug. The workflow configs in the database are correct per period — they were just never being queried properly.
- **No regression**: The fix changes how the RPC is called, not the RPC itself. All other consumers of `get_bulk_employee_workflows` already use the correct singular params.
- **Immediate fix for all cases**: Every employee with historical workflow changes will immediately show correct historical stages once the RPC call is fixed.

