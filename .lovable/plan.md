## Problem

Access Profiles let an admin grant `can_add / can_update / can_delete` on menus like `admin-users`, `admin-kpis`, `admin-org-kpis`, etc. to non-admin users. But the underlying tables (`profiles`, `user_roles`, `kpis`, `org_kpi_values`, …) have RLS that only allows `admin` (or owner) writes. Result: the UI shows the action, the user clicks Save, Supabase returns no error (RLS filters the row), and the toast says "Updated successfully" — but **nothing changed**.

We already patched `UserManagement.updateUser` with a `.select()` row-count guard. That treats the symptom on one page. The fix needs to be systemic so menu rights and RLS stay aligned.

## Goal

When an Access Profile grants a write right, the corresponding DB write must either:
- **(A)** actually succeed (RLS recognizes the profile grant), OR
- **(B)** fail loudly with a clear "no permission" toast — never a false success.

## Approach (two layers, both required)

### Layer 1 — DB: teach RLS about profile-based rights (SSOT)

1. Add a SECURITY DEFINER helper:
   ```
   public.has_menu_right(_user_id uuid, _menu_key text, _action text) returns boolean
   ```
   Reads `access_profile_assignments` → `access_profile_menu_rights`, returns true if `can_view/add/update/delete` matches. `stable`, `search_path=public`.

2. Extend RLS policies on the tables that the admin-menu pages actually write to, using `has_menu_right`. Scope (minimum, conservative set tied to existing menu_keys):
   - `profiles` — UPDATE: allow if `has_menu_right(auth.uid(), 'admin-users', 'update')`. INSERT: `'admin-users','add'`. (DELETE stays admin-only.)
   - `user_roles` — INSERT/DELETE: `'admin-users','update'` (role grant is part of editing a user).
   - `menu_access_user_overrides` — INSERT/DELETE: `'admin-menu-access','update'`.
   - `access_profile_assignments` — INSERT/DELETE: `'admin-access-profiles','update'`.
   - Any other admin menus the user wants delegated → add in same pattern. We will enumerate during build and confirm before extending past `admin-users`.

3. Add `WITH CHECK` mirrors for every new policy (per project rule on workflow transitions).

4. Migration is **additive**: existing admin-only policies stay; new policies are `OR`-ed by Postgres' permissive-policy semantics. Rollback = drop the new policies.

### Layer 2 — Frontend: universal silent-RLS guard

5. Add `src/lib/db/assertRowsTouched.ts`:
   ```ts
   assertRowsTouched(rows, error, menuKey, action)
   ```
   Throws a uniform `PermissionError` with toast-ready copy: *"Your access profile does not allow {action} on {menuLabel}. Ask an admin to grant the right or perform the change."*

6. Wrap every admin-page mutation that currently does `.update()/.insert()/.delete()` on a profile-protected table to:
   - append `.select('id')`
   - call `assertRowsTouched(...)`
   Pages to update (initial sweep — confirm scope below):
   - `src/pages/admin/UserManagement.tsx` (extend existing guard to insert + role grant + bulk)
   - `src/pages/admin/AccessProfiles.tsx` (assignments, menu rights save)
   - `src/pages/admin/MenuAccess.tsx` (user overrides)
   - `src/hooks/useAccessProfiles.ts` (`saveMenuRights`, `assignUser`, `removeAssignment`)
   - `src/hooks/useMenuAccess.ts` (`grantUserMenuAccess`, `revokeUserMenuAccess`)

7. `useMenuAccess.canPerform(menuKey, action)` already exists. Audit the four admin pages above and disable buttons / hide actions when `canPerform` returns false, so the user sees the gate **before** clicking (defence in depth; the DB+toast guard remain the source of truth).

### Layer 3 — Tests & docs

8. Tests (vitest):
   - `accessProfileRlsAlignment.test.ts` — table of (menu_key, action, table) → guard throws when RLS filters, passes otherwise (using the same shape as `userManagementSilentRlsGuard.test.ts`).
   - Extend existing silent-RLS test with insert + role-grant cases.

9. Docs:
   - `DOCUMENTATION.md` → Access Profiles section: add "How profile grants reach the database" diagram + `has_menu_right` contract.
   - `POLICY.md` → Access Profiles: "A menu right is binding only if (a) RLS recognizes it via `has_menu_right`, or (b) the user already has the underlying role. Otherwise the action is blocked with a permission toast — never a silent success."
   - New ADR `docs/adr/ADR-079.md`: "Access-Profile / RLS alignment".
   - Memory update: `mem://features/admin/profile-based-menu-access` → note `has_menu_right` SSOT and the universal guard.

## Risk & Impact

- **Data:** additive RLS policies only; no schema changes; existing admin flows unchanged.
- **Security:** widening write access to non-admins who hold the matching profile right. **Need explicit user sign-off on which menus to delegate** (default proposal = `admin-users` only for v1).
- **Regression:** low — `assertRowsTouched` only converts a hidden no-op into a visible error.
- **Scalability:** `has_menu_right` is one indexed lookup per row; fine.
- **Rollback:** drop new policies + revert frontend wrappers; helper function can stay.

## Clarifying questions before I write the plan as code

1. For v1, should DB-level delegation cover **only `admin-users`** (the menu Avinash used), or also `admin-access-profiles`, `admin-menu-access`, and other admin menus? My recommendation: start with `admin-users` to keep blast radius small.
2. Should profile-granted users be able to change a target user's **role** (`user_roles`), or only profile fields (name, status, manager)? Today the UI exposes both; safer default is **profile fields only**, role changes remain admin-only.
3. OK to disable (grey-out) admin-page action buttons when `canPerform` is false, in addition to the toast? Or keep buttons live and rely on the toast?

## Out of scope
- Reworking the menu_access vs access_profiles dual model.
- Any change to `pms-policy` visibility (BUG-042 path stays).
