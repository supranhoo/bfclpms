## Problem

Editing any user in User Management fails with:
`Failed to update user — infinite recursion detected in policy for relation "profiles"`.

Reproduced by admin Ankit updating Mithilesh Kumar Jha (100841) email from `jhamithileshkumar40@gmail.com` → `jha.mithileshkumar40@gmail.com`.

## Root Cause

The RLS policy `"Users can update their own profile"` on `public.profiles` was recently hardened to lock down self‑editable fields. Its `WITH CHECK` clause contains ~14 inline sub‑selects of the shape:

```sql
NOT ((SELECT p.reporting_manager_id FROM profiles p WHERE p.id = auth.uid())
      IS DISTINCT FROM reporting_manager_id)
```

Every `UPDATE profiles` — even one performed by an admin who is authorised through the separate `"Admins can manage all profiles"` policy — forces Postgres to evaluate the WITH CHECK of every matching permissive policy. Those inline sub‑selects issue `SELECT ... FROM profiles` which re‑enters the profiles policy set. Postgres' cycle detector aborts with `infinite recursion detected in policy for relation "profiles"`.

This is exactly the pattern called out in the `infinite-recursion-in-rls` guardrail: a profiles policy must not query `profiles` inline — it must go through a `SECURITY DEFINER` helper.

## Fix (single migration, no app code changes)

1. Create a `SECURITY DEFINER` helper `public.current_profile_locked_fields()` that returns the caller's own row's locked columns (`reporting_manager_id`, `department_id`, `pms_grade`, `employment_status`, `is_active`, `portal_access`, `confirmation_increment_granted`, `company_id`, `designation`, `employee_code`, `level_id`, `location_id`, `functional_manager_id`, `designated_proxy_user_id`) as a single ROW. Owned by postgres, `search_path = public`, `STABLE`.
2. Drop and recreate `"Users can update their own profile"` with the same intent but the WITH CHECK rewritten to call the helper once:
   ```sql
   WITH CHECK (
     auth.uid() = id
     AND (locked_fields).reporting_manager_id IS NOT DISTINCT FROM reporting_manager_id
     AND (locked_fields).department_id       IS NOT DISTINCT FROM department_id
     ... etc.
   )
   ```
   using a `WHERE` on a lateral / scalar call so the helper runs exactly once and does not touch `profiles` through RLS.
3. No changes to admin, HR, manager, auditor, safety, org‑KPI, annual‑review, or menu‑access policies. All existing SECURITY DEFINER helpers stay.

## Verification

- Re‑run the failing Edit User save for Mithilesh (100841) — expect success and `profiles.email` updated to the new address.
- Confirm a non‑admin self‑update still blocks the locked fields (regression test): attempt to update `reporting_manager_id` on own row → still rejected.
- Run `supabase--linter` after migration — no new warnings.
- Add regression test asserting the WITH CHECK of `"Users can update their own profile"` contains no inline `SELECT ... FROM profiles`.

## Risk & Impact

- **Data impact:** none. No column, index, or row is modified.
- **Workflow impact:** none. Behaviour of the self‑update policy is preserved bit‑for‑bit (same locked columns).
- **UI impact:** none.
- **Regression risk:** low. Only one policy is touched; admin path already worked via a separate policy.
- **Rollback:** re‑apply the previous policy definition (kept verbatim in the migration comment).

## Documentation

- ADR‑143 — Break profiles self‑update RLS recursion via SECURITY DEFINER locked‑fields helper.
- `POLICY.md` — note under §Profile Self‑Update: locked fields are enforced through `current_profile_locked_fields()`; profiles policies MUST NOT inline‑select from `profiles`.
- `mem/architecture/security/profile-identity-integrity.md` — add the "no inline profiles select in profiles policies" rule.
