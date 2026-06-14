## Root Cause

The user "Avinash Kumar" (id `951a9c3f…`) is **not** an `admin` in `user_roles` — his base role is `employee`. He has been given the `Onboarding` **Access Profile** which grants `admin-users` → `can_add = true`.

The frontend "Add User" dialog correctly enables the button (it consults `useMenuAccess`), but the backing edge function `supabase/functions/create-employee/index.ts` (lines 68–80) hard-checks `user_roles.role = 'admin'` and rejects everyone else with **"Unauthorized - admin access required"** — exactly the toast in the screenshot.

This violates the project's Access-Profile / RLS alignment SSOT (`mem/architecture/security/access-profile-rls-alignment.md`), which mandates that any delegated menu right (`admin-users / add`) must be honoured server-side via `public.has_menu_right(_user_id, _menu_key, _action)`.

## Risk & Impact Report

- **Data impact**: None — no schema change. Only widens the auth gate from "admin role" to "admin role OR has_menu_right('admin-users','add')".
- **Workflow impact**: HR / Onboarding profile users (and any future profile that explicitly carries `admin-users.can_add`) can now create employees. Matches the intent of the Access Profile they were assigned.
- **Security**: `has_menu_right` is SECURITY DEFINER + STABLE and is already the SSOT used by RLS policies; no new privilege surface is introduced. Admin-only paths (role grants, profile deletes) remain untouched.
- **Regression risk**: Low. Admins keep working (short-circuit). Behaviour for non-privileged users is unchanged (still 403).
- **Scalability**: Adds at most one extra RPC round-trip on the create path (negligible).

## Plan

1. **`supabase/functions/create-employee/index.ts`** — after resolving `user`, authorise if **either**:
   - existing admin check passes, **or**
   - `supabaseAdmin.rpc('has_menu_right', { _user_id: user.id, _menu_key: 'admin-users', _action: 'add' })` returns `true`.
   
   On failure, return the same 403 with a clearer message: `"Unauthorized — 'Add User' permission required"`.

2. **No DB migration required** — `has_menu_right` already exists and is used by RLS.

3. **DOCUMENTATION.md / POLICY.md** — append a note to `src/modules/.../POLICY.md` (admin-users section) and `mem/architecture/security/access-profile-rls-alignment.md` entry confirming that `create-employee` edge function honours `admin-users / add`.

4. **Tests** — add `supabase/functions/create-employee/auth.test.ts` covering: admin allowed, delegated user allowed, plain employee rejected (mock `auth.getUser` + `from('user_roles')` + `rpc('has_menu_right')`).

## UI Changes

None. The dialog already shows for delegated users; only the server response changes from 403 → success.

## Out of Scope (not changed in this patch)

- `update-user-email` and `update-user-profile` still require admin. They can be migrated later under the same SSOT once HR delegation for edits is confirmed by the user.
- Role grants (`user_roles` writes) remain admin-only per the SSOT.

## Rollback

Single-file revert of `create-employee/index.ts` restores the prior behaviour. No data is mutated by this change itself.
