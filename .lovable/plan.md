

# Fix: Allow Auditors to See Other Auditors in Assignment Popover (v1.46.23)

## Root Cause

The `user_roles` table has two RLS policies:
1. **Admins can manage all roles** (ALL) -- admins see everything
2. **Users can view their own roles** (SELECT where `user_id = auth.uid()`) -- everyone else only sees their own row

When an auditor opens the "Assign to Auditor" popover, the `useAuditorsList` hook queries `user_roles` for all rows where `role = 'auditor'`. But RLS filters it down to **only the current user's row**. The popover either shows just the logged-in auditor (useless for delegation) or appears empty if the join fails.

## Solution

Add a new RLS policy on `user_roles` that allows auditors to see other auditor role entries. This is a targeted, read-only policy -- auditors still cannot modify anyone else's roles.

## Changes Required

### 1. Database Migration -- New RLS Policy on `user_roles`

Add a SELECT policy allowing auditors to view rows where `role = 'auditor'`:

```sql
CREATE POLICY "Auditors can view auditor roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  role = 'auditor'
  AND has_role(auth.uid(), 'auditor'::app_role)
);
```

This means: if you are an auditor, you can see all rows where `role = 'auditor'`. You still cannot see admin, manager, or other role entries. This is the minimum-privilege approach.

### 2. No Code Changes Required

The `useAuditorsList` hook and `AuditKpiAssignPopover` component are already correctly implemented. Once the RLS policy allows auditors to read other auditor rows, the popover will populate with the full list of auditors.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data exposure | Minimal | Policy is scoped: auditors can only see `role = 'auditor'` rows, not admin/manager roles |
| Privilege escalation | None | Read-only policy; no INSERT/UPDATE/DELETE granted |
| Regression | None | Additive policy; existing "view own roles" and "admin manage all" policies unaffected |
| Integrity | Safe | No data modification involved |

## Technical Details

- **Table**: `user_roles`
- **New policy**: SELECT-only, scoped to `role = 'auditor'` rows, only for users who themselves have the auditor role
- **Migration file**: Single `CREATE POLICY` statement

