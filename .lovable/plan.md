

## RCA & Fix: Incentive Amount Not Showing After Computation

### Investigation Summary

**Data confirmed in database:**
- 1 record exists for March 2026, Metal Sizing program
- `incentive_amount = 2000`, `final_incentive_percent = 0`, employee = "Dummy"
- The edge function correctly aggregated production daily entries × rate and stored the amount

**Root Cause: Frontend query returns 0 records**

The `useIncentiveRecords` hook fetches records but the table shows empty. Two issues identified:

1. **Silent query error** — The hook uses `profiles:employee_id(full_name, employee_code, department_id, designation, departments(name))` as a PostgREST embedded join. If the logged-in user's RLS on `departments` blocks access (departments RLS may not include the user's role), PostgREST can return a 400 error. The component does not display errors — it only shows "No records found", masking the actual failure.

2. **No program_id filter on query** — `useIncentiveRecords` fetches ALL records for the month/year regardless of which program is selected. While not the cause of 0 records, this means records from different programs get mixed together.

3. **Missing error display in UI** — The component never shows React Query errors, so any PostgREST failure silently appears as "no records."

### Fix Plan

**`src/hooks/useIncentiveRecords.ts`**:
- Add optional `programId` parameter to `useIncentiveRecords`
- When provided, filter by `program_id`
- Add error logging in queryFn for debugging

**`src/components/incentive/MonthlyIncentiveTable.tsx`**:
- Pass `selectedProgram` to `useIncentiveRecords` so records are filtered by program
- Add error state display — show the actual error message when query fails instead of "No records found"
- Show a React Query error banner when `isError` is true

**RLS — Add `departments` SELECT policy for incentive users**:
- Create a migration that adds a SELECT policy on `departments` for users with `admin-incentive` menu override (if not already present), ensuring the PostgREST join doesn't fail

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useIncentiveRecords.ts` | Add optional `programId` param; add error logging |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Pass programId; display query errors; improve empty state messaging |
| DB migration | Add departments SELECT policy for menu override users (if missing) |
| `DOCUMENTATION.md` | v2.15.32 |

### Risk Assessment
- **Regression**: Low — additive RLS policy, filter is optional
- **Dashboard Safety**: No changes to profiles RLS; departments policy is SELECT-only
- **Data**: No schema changes

