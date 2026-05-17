## Root cause

**Issue 1 — "Grant failed: violates foreign key safety_user_roles_user_id_fkey"**
`public.safety_user_roles.user_id` has a single FK to `auth.users(id)`. The selected user **Vedant Pawar (emp 101966)** exists in `public.profiles` but has **no `auth.users` row** (`has_auth = false`, `portal_access = false`) — he was created via Employee Master Backfill and has never been provisioned for login. The FK therefore rejects the insert. This is the same "profile-without-auth" state covered by mem `non-login-user-provisioning`; PMS handles it via Password Rollout, but Safety's grant flow doesn't.

**Issue 2 — Assignments list shows raw UUIDs instead of names**
`SafetyUsers.tsx` builds `profilesById` only from the search result (limited to 50 rows and filtered by the active search term). Any assigned user not in that small slice falls back to `row.user_id`. The list never fetches profiles for the user_ids that are actually assigned.

## Plan

### 1. Auto-provision login when a Safety role is granted

Create a new admin edge function `grant-safety-role` that does the full operation server-side under service-role, mirroring the canonical Password Rollout provisioning contract (mem `non-login-user-provisioning`):

1. Validate caller's JWT → must be either PMS admin (`public.user_roles.role = 'admin'`) or already-existing Safety admin.
2. Read target `profiles` row (id, email, full_name, employee_code, portal_access).
3. Probe `auth.admin.getUserById(profile.id)`.
   - **Present** → no-op on auth.
   - **Missing** → if profile has a real email (`has_real_email = true`), call `auth.admin.createUser({ id: profile.id, email, password: <random 16-char>, email_confirm: true, user_metadata: { full_name, employee_code } })`. Profile id is reused verbatim so every existing FK stays intact. If the profile has no real email, return a 409 with a clear message asking admin to add an email first; do not invent one.
   - On create, also set `profiles.portal_access = true` and `profiles.has_real_email = true` (already true here).
4. Insert into `safety_user_roles` with `(user_id, role, business_unit_id, department_id, assigned_by)`.
5. Return `{ ok: true, auth_action: 'created' | 'existing', user_id, granted_role }` so the UI can surface a toast like *"Vedant Pawar now has login + Safety Admin role. A password reset will be required on first sign-in."*
6. CORS headers on every response (including errors).

Front-end:
- Replace the direct `supabase.from('safety_user_roles').insert(...)` call in `useGrantSafetyRole` with `supabase.functions.invoke('grant-safety-role', ...)`.
- Toast wording reflects whether login was newly provisioned vs already existed.
- No schema change; the FK to `auth.users` stays — we just ensure the row exists before inserting.

### 2. Show real names in "Current Safety role assignments"

In `SafetyUsers.tsx`:
- Add a second `useQuery` keyed on the sorted list of assigned `user_id`s from `rolesQuery.data`, fetching `id, full_name, email, employee_code` from `profiles` with `.in('id', userIds)` — independent of the search box and not capped to 50.
- Use that map for the assignments list (`profile?.full_name || profile?.email || row.user_id`).
- Also show `employee_code` next to the name to match the search-result styling and avoid bare UUIDs even when a profile is missing.
- Keep the search-scoped `profilesQuery` for the picker (unchanged).

### 3. Docs / memory sync
- `DOCUMENTATION.md` → new section under Safety RBAC describing `grant-safety-role` and the auto-provisioning behaviour.
- `POLICY.md` → extend §113 (non-login user provisioning) to list `grant-safety-role` as a canonical first-login provisioning entry-point alongside `password-rollout`.
- `mem/architecture/safety/rbac.md` → note the FK-to-auth.users contract and the provisioning hand-off.

## Risk & impact
- **Data**: zero schema change. No existing rows touched. New `auth.users` rows reuse `profiles.id` so all FKs stay aligned.
- **Workflow**: existing Safety admins can now grant roles to backfilled employees in one click instead of bouncing through Password Rollout.
- **Security**: edge function is admin-gated (PMS admin OR Safety admin) and runs on service-role. Random password + `email_confirm: true` means the new account is unusable until the admin runs the standard password reset flow.
- **Regression**: revoke path, RLS, and existing role rows are untouched. The "Names look bad" fix is purely a frontend render fix.

## Verification
- Re-grant Safety Admin to Vedant Pawar → succeeds, toast says login was provisioned.
- `auth.users` now has a row with id = `b1110516-1a80-493c-9297-39e0355b0cb6`.
- `safety_user_roles` shows the new row; the assignments list renders **"Vedant Pawar · 101966"** instead of the UUID.
- Existing three Safety Admin rows in the screenshot also render their real names.
- Granting a role to a user who already has login still works (no-op on auth path).
- Granting to a profile with no real email returns a clear 409 toast instead of the cryptic FK error.
