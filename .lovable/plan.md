
## Goal
Make the Safety module visible to every authenticated employee, matching the org-wide rollout directive that "every employee must be able to raise incident reports regardless of role". Role-based permissions inside Safety (officer/BU head/etc.) remain unchanged — only the **visibility gate** is opened.

## Root Cause Recap
`public.has_safety_module_access(uid)` currently returns true only if the user is a PMS admin, has a `safety_module_access` row, or has a `safety_user_roles` row. Regular employees match none of these, so `useModules` hides the Hub card and `SafetyModuleRoute` redirects them to `/home`.

## Risk & Impact Report
- **Data Impact:** None. No schema change. Only the body of one SECURITY DEFINER function changes.
- **Workflow Impact:** Every authenticated user gains visibility of the Safety Hub card and `/safety/*` routes. Internal Safety role checks (`has_safety_role`, RLS on `safety_incidents`, `safety_user_roles`, etc.) are unchanged, so privileged actions (closure approvals, RBAC management, audit log access) remain gated correctly.
- **UI/UX:** Safety card appears in Module Hub for all users. Pages that require a Safety role (Users management, SLA monitor, audit log) will still deny access via their own RLS / role checks — users who land there see empty states or "no access" messages handled by existing components. Incident reporting page (the universal entry) becomes reachable.
- **Regression Risk:** Low. The function is only used by `useModules` (Hub card filter) and `SafetyModuleRoute` (route guard). Both already exist; only their boolean answer flips for non-admin users.
- **Scalability:** O(1) — function returns `true` immediately for any authenticated user.
- **Mitigation:** Keep the function signature identical; only widen the return condition. Add a regression test that asserts a plain authenticated user (no safety role, no module_access row, not a PMS admin) gets `true` from the RPC.

## Change (single migration)

Replace `public.has_safety_module_access(uuid)` with:

```sql
CREATE OR REPLACE FUNCTION public.has_safety_module_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Org-wide rollout: Safety module is visible to every authenticated user.
  -- Role-based actions inside Safety remain gated by has_safety_role() and
  -- per-table RLS policies; this function only controls Hub visibility and
  -- the /safety/* route guard.
  SELECT _user_id IS NOT NULL;
$$;
```

`GRANT EXECUTE` to `authenticated` is preserved (no change).

## What stays the same
- `safety_user_roles` table, `has_safety_role()`, and every Safety RLS policy.
- `safety_module_access` table (kept for backwards compatibility and future per-user revoke scenarios; no longer the gate).
- `SafetyModuleRoute` and `useModules` code — they keep calling the RPC, just get `true` more often.
- Incident submission RPC (`report_safety_incident`) and its RLS — unchanged.

## Tests
- `src/test/safety/safetyModuleAccess.test.ts` (new): assert the RPC returns `true` for a freshly created user with no safety role and no `safety_module_access` row; returns `false` for `null`.
- Extend `src/test/safetyShellIsolation.test.tsx` (or co-locate) to lock the universal-access invariant at the SQL-text level.

## Docs & Memory
- `DOCUMENTATION.md` → bump version, add Phase 19 entry "Safety module universal visibility".
- `POLICY.md` → §Safety-Access: replace beta opt-in clause with org-wide rollout clause.
- `mem/architecture/safety/rbac.md` → update the "Module access" bullet to reflect universal visibility + role-gated actions.
- `mem/index.md` → adjust Safety core line.

## Rollback
Single migration reverts the function body to the previous three-condition form. No data migration needed.

## Out of scope (intentionally)
- No backfill of `safety_user_roles` (avoids granting accidental privileges).
- No changes to who can manage RBAC, see audit logs, or approve closures.
- No UI copy changes beyond what's already wired.
