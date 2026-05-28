# RCA #2 — UserManagement uses an RPC that ignores access-profile grants

## What I missed last turn
The previous fix added an RLS policy on `public.profiles` that lets profile-granted users read scoped rows. That works for any code path that goes through `supabase.from('profiles').select(...)`.

But `useProfiles()` (the source feeding User Management) does **not** read `profiles` directly — it calls SECURITY DEFINER RPC **`public.get_reviewer_roster_slim()`**. Because SECURITY DEFINER runs as the function owner, it **bypasses RLS** entirely. The RPC has its own role check:

```sql
v_is_full := has_role(uid,'admin')
          OR has_role(uid,'auditor')
          OR has_role(uid,'hr_pms')
          OR has_role(uid,'management')
          OR has_report_access_override(uid);
```

Avinash is `employee` and has no report-access override → falls into the ELSE branch which returns only `directs ∪ indirects ∪ self`. He has no reports, so result = 1 row (himself). The new RLS policy never fires.

## Fix plan — single migration

Extend `get_reviewer_roster_slim()` with a third branch for access-profile grantees:

```text
IF v_is_full                                         → return full active roster
ELSIF has_profile_menu_access(uid,'admin-users','view')
                                                     → return active roster ∩ get_visible_employee_ids(uid)
ELSE                                                 → existing directs/indirects/self branch (unchanged)
```

SQL sketch (final code in migration):

```sql
CREATE OR REPLACE FUNCTION public.get_reviewer_roster_slim()
RETURNS TABLE (...same columns...)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full boolean;
  v_has_admin_users boolean;
BEGIN
  PERFORM set_config('statement_timeout','30000',true);
  IF v_uid IS NULL THEN RETURN; END IF;

  v_is_full := has_role(v_uid,'admin') OR has_role(v_uid,'auditor')
            OR has_role(v_uid,'hr_pms') OR has_role(v_uid,'management')
            OR has_report_access_override(v_uid);

  IF v_is_full THEN
    RETURN QUERY SELECT ... FROM profiles p WHERE p.is_active ORDER BY p.full_name;
    RETURN;
  END IF;

  v_has_admin_users := has_profile_menu_access(v_uid,'admin-users','view');

  IF v_has_admin_users THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
             p.pms_grade, p.department_id, p.reporting_manager_id,
             p.avatar_url, p.level, p.is_active, p.company_id
      FROM public.profiles p
      JOIN public.get_visible_employee_ids(v_uid) v ON v.employee_id = p.id
      WHERE p.is_active = true
      ORDER BY p.full_name;
    RETURN;
  END IF;

  -- existing directs/indirects/self branch (unchanged, copied verbatim)
  RETURN QUERY WITH directs AS (...) ... ;
END;
$$;
```

No GRANT/RLS changes — the function already has EXECUTE granted and is SECURITY DEFINER.

## Risk & Impact
- **Data**: Read-only; no schema/data mutation.
- **Workflow**: Only changes output for users who have `access_profile_menu_rights.can_view=true` on `admin-users`. Admin/auditor/HR/manager-employee paths unchanged (early-return preserves current behaviour).
- **Regression**: Existing manager/employee branch is copied verbatim into ELSE so nothing else shifts.
- **Scalability**: New branch joins active `profiles` with `get_visible_employee_ids()` (already used and cached). Same order of magnitude as the existing full-roster branch.
- **Rollback**: Single `CREATE OR REPLACE FUNCTION` — reversible by re-running the prior definition (already captured in earlier migrations).

## Tests / verification
After migration, run as Avinash:
```sql
SELECT count(*) FROM get_reviewer_roster_slim();   -- expect ~2538
```
And in the UI, refresh `/admin/users` → "Showing N of N users" with N == scope size. React-Query key `['profiles']` will refetch on next focus / 5-min staleTime; suggest hard refresh once.

## Out of scope (unchanged)
- Write paths (Add / Update / Delete) still require `admin` role in the `admin-users` edge function. UI hides those buttons for non-admins.
- Other RPCs that gate visibility by classic roles (`useProfilesWithHierarchy` is direct-table and already covered by the previous RLS fix; other reports were not requested).

## Files touched
- New migration: `supabase/migrations/<ts>_extend_reviewer_roster_slim_access_profile.sql`
- No client code changes.
