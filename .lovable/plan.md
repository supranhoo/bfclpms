

## Fix: Reviewer Name Missing in Self-Review Tab (All Months)

### Root Cause

In `src/hooks/usePendingSelfReviews.ts`, the `useOverdueKraSetKpis` hook (Self-Review tab):

1. **Line 78**: The Supabase query does NOT select `reporting_manager_id` from profiles — it only fetches `full_name, employee_code, department_id, departments(name)`
2. **Lines 128-131**: All manager/skip-level fields are hardcoded to `null`

The Manager Review and Skip-Level tabs correctly fetch `reporting_manager_id` and resolve names (lines 149, 200-282). The Self-Review tab was never updated to do the same.

### Fix

#### File: `src/hooks/usePendingSelfReviews.ts`

1. **Line 78**: Add `reporting_manager_id` to the profiles select:
   ```
   profiles!kpis_employee_id_fkey ( full_name, employee_code, department_id, reporting_manager_id, departments ( name ) )
   ```

2. **Lines 103-133**: Replace the simple loop with the same manager/skip-level name resolution pattern used in `useOverdueTeamReviewKpis`:
   - Collect unique `reporting_manager_id` values from profiles
   - Batch-fetch manager names from `profiles`
   - Derive skip-level manager IDs from managers' `reporting_manager_id`
   - Batch-fetch skip-level names
   - Populate `reportingManagerName` and `skipLevelManagerName` in each result

This ensures the Reviewer column works across all tabs and all months.

### No database changes needed

