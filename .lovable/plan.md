

## Plan: Fix "Unknown" Employee Names in Audit Review

### Root Cause

The profiles query in `useOrgKpiAuditReview.ts` selects `designation_id` — a column that **does not exist** on the `profiles` table. The actual column is `designation` (text). Because the query result is cast with `as any`, the PostgREST error is silently swallowed, returning no profile data → all employees show "Unknown".

This is purely a code bug. **No RLS or database changes needed** — admin, auditor, and hr_pms roles already have SELECT policies on all profiles.

### Fix

**`src/hooks/useOrgKpiAuditReview.ts`**:
1. Change `.select('id, full_name, employee_code, department_id, designation_id')` → `.select('id, full_name, employee_code, department_id, designation')`
2. Remove the separate `designations` table lookup — use the `designation` text field directly
3. Remove the `as any` cast on the profiles query to surface errors properly
4. Map `emp.designation` directly to `designationName` instead of looking up via `desigMap`

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useOrgKpiAuditReview.ts` | Fix column name `designation_id` → `designation`; remove designations table lookup; remove `as any` |
| `DOCUMENTATION.md` | v2.15.30 — fix Unknown names |

### Risk Assessment
- **Regression**: Zero — no RLS changes, no new policies. The previous dashboard crash was caused by an RLS policy on profiles referencing kpis; this fix only changes a column name in a SELECT
- **Security**: No changes to access control; existing role-based policies already grant visibility
- **Data**: Read-only fix, no schema changes

