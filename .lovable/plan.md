

## Fix: Add Missing UPDATE RLS Policy for Menu Access Overrides

### Root Cause
The `menu_access_user_overrides` table has INSERT, SELECT, and DELETE RLS policies but **no UPDATE policy**. The code uses `.upsert()` with `onConflict: 'menu_key,user_id'`, which requires UPDATE permission when a matching row already exists. This causes a silent RLS violation → the "Failed to grant access" error.

### Solution

**1. Database Migration** — Add an UPDATE RLS policy:
```sql
CREATE POLICY "Admins can update menu user overrides"
ON public.menu_access_user_overrides
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

**2. Documentation** — Update POLICY.md and DOCUMENTATION.md to record the fix.

### Risk Assessment
- **Data Impact**: None — additive policy only
- **Security**: Maintained — same admin-only guard as INSERT/DELETE
- **Regression**: None — only enables the upsert that was already intended

