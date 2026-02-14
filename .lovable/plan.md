

# Fix: KPI Send Back Not Persisting (Silent RLS Failure)

## Root Cause Analysis

The issue is a **silent RLS (Row Level Security) failure**. When an admin sends back a KPI:

1. The code calls `supabase.from('kpis').update({ status: newStatus }).eq('id', kpi_id)`
2. The `kpis` table has UPDATE policies for: employee, manager, auditor, management, hr_pms, skip-level -- but **NO policy for admin**
3. Both admin users (IDs: `35bb...`, `535d...`) only have the `admin` role -- they lack any reviewer role
4. RLS silently blocks the update: **no error is returned**, but **zero rows are updated**
5. The same problem exists for `review_submissions` -- no admin UPDATE policy
6. The UI invalidates queries and refetches, but since nothing actually changed in the database, the KPI still shows its old status with the "Review" and "Send Back" buttons

The same silent failure also affects the `kpi_audit_logs` INSERT (audit trail not written).

## Two-Part Fix

### Part 1: Add missing RLS policies for admin role

Add UPDATE policies on both `kpis` and `review_submissions` tables to allow admins to perform workflow actions:

```text
-- kpis: Admin can update any KPI
CREATE POLICY "Admin can update KPI status"
  ON public.kpis FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- review_submissions: Admin can update any submission
CREATE POLICY "Admin can update submissions"
  ON public.review_submissions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### Part 2: Add row-count verification to send back mutation

Even after fixing RLS, add a safety net so silent failures never happen again. Use `.select()` with count verification:

In `UnifiedScorecard.tsx`, change the send back mutation to verify the update actually modified a row. If zero rows were affected, throw an explicit error like: "Failed to update KPI status. You may not have permission to perform this action."

## Files to Modify

| File | Change |
|---|---|
| New SQL migration | Add admin UPDATE policies on `kpis` and `review_submissions` |
| `src/components/review/UnifiedScorecard.tsx` | Add `.select().single()` or row-count check on the send back mutation's KPI update to catch silent failures |
| `DOCUMENTATION.md` | Document the fix |

## Impact

- **Fixes**: Admin send back, admin review submissions, and any other admin workflow action that modifies kpis/review_submissions
- **Safety**: Row-count verification prevents any future silent RLS failures from going unnoticed
- **Risk**: Very low -- purely additive RLS policies; admin already has full SELECT access

