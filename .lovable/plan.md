# Fix: User Management filters return 0 results

## Root cause

The User Management page (`src/pages/admin/UserManagement.tsx`) already has a working **Status** filter (All / Active / Inactive) and applies department/role/search filters client-side over `useProfiles()`.

The bug is upstream: `useProfiles()` calls the RPC `public.get_reviewer_roster_slim()`, and the **admin / hr_pms / management / auditor** branch of that RPC hard-filters `WHERE p.is_active = true`. So inactive employees never reach the client. Result:

- "Inactive" filter → 0 rows (because none were loaded).
- Any combination that depends on an inactive employee (e.g. searching an inactive person, picking a department that only has inactive matches) → 0 rows.
- Top stat cards still show "Inactive 10" because they use a separate `count head: true` query — that masked the issue.

The same RPC already has a "User Management branch" (added 2026-05-28) that intentionally **includes inactive** via `get_user_management_visible_employee_ids` — but only for non-admin profile-scoped users. Admins fall into the first branch and lose inactive rows.

## Fix (minimal, surgical)

### 1. DB migration — `get_reviewer_roster_slim`
Drop the `WHERE p.is_active = true` clause **only in the admin/full-access branch** so the full roster (active + inactive) is returned to admins. All downstream callers already either:
- filter `is_active` client-side themselves (UserManagement, status filter), or
- map to `EmployeeCombobox` lists that explicitly call `.eq('is_active', true)` on their own queries (they don't depend on this RPC for activity filtering).

The non-admin direct/indirect branch keeps its `is_active = true` guard (reviewers should not see inactive subordinates).

```sql
-- admin/full-access branch only
SELECT ... FROM public.profiles p
ORDER BY p.full_name;  -- no is_active filter
```

### 2. Client — keep `useProfiles()` unchanged
No code change needed. The hook already returns whatever rows the RPC sends. UserManagement's existing `statusFilter` will start working immediately.

### 3. Audit other consumers of `useProfiles()` (read-only check)
Confirm no list currently assumes "active only" implicitly. Quick `rg` shows the main consumers (`UserManagement`, employee pickers via `useActiveEmployeesForCopy` which uses its own paged query, etc.) all filter `is_active` themselves where needed. Any that don't will be patched with a one-line `.filter(p => p.is_active !== false)` — to be confirmed during implementation.

## Risk & Impact

- **Data impact**: none. Pure read change; no schema or row mutation.
- **RLS / Security**: unchanged. Admin already has full visibility; we are only widening the same admin set from "active" to "active + inactive". Non-admin branches untouched.
- **Workflow impact**: none for review flows (they use other queries/RPCs scoped to active employees).
- **Regression risk**: low. Risk vector = any UI built on `useProfiles()` that silently assumed "active only". Mitigation = the audit step above plus a defensive client-side filter where needed.
- **Scalability**: +~10 rows out of ~2,548. Negligible.
- **Rollback**: re-add the `WHERE p.is_active = true` clause in a one-line migration.

## Acceptance

1. On `/admin/users`, the **Inactive** status filter shows the 10 inactive users.
2. Searching an inactive employee by name/code returns them (with the existing "Inactive" badge + muted row).
3. **Active** and **All Status** views are unchanged in count and ordering.
4. Top stat cards (Total / Active / Inactive / Admins) remain correct.
5. Employee pickers elsewhere (Copy KRA, Bulk Review, Reports) still show active-only.

## Out of scope

- No UI redesign of the existing Status dropdown.
- No change to non-admin reviewer roster behaviour.
- No change to `Bulk Grant Access`, Identity & Access Console, or stat-card queries.
