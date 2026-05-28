# RCA — Why Avinash sees only himself in User Management

## Confirmed facts (DB-verified)
- Avinash (101732) is assigned the **Onboarding** access profile (`access_profile_assignments` ✓).
- Onboarding profile has **`admin-users`** menu rights: `can_view=true, can_add=true, can_update=true` (`access_profile_menu_rights` ✓).
- Onboarding profile has **399 Org-Level Scope rows** (`access_profile_org_scope` ✓).
- The new RPC `public.get_visible_employee_ids(avinash.id)` correctly returns **2,538 employee IDs** — the scope math works.

## Root cause
The fix shipped last turn filters the client roster against `get_visible_employee_ids`, but the **client roster itself is fetched via `supabase.from('profiles').select(...)`**, which is constrained by Row-Level Security on `public.profiles`.

Current `profiles` SELECT policies only allow:
- `admin / auditor / hr_pms / management` roles → all rows
- `manager` role → direct + skip-level reports
- `incentive data entry override` → all active (legacy `menu_access_user_overrides` table only)
- self (`auth.uid() = id`)
- a few org-KPI-data-owner narrow paths

Avinash's `app_role` is `employee`, and his "admin-users" permission comes through the **new access-profile system** (`access_profile_menu_rights`), which **no RLS policy on `profiles` recognises**. Result: RLS returns exactly **1 row (himself)**, then our visibility intersection of `{self} ∩ {2538 scoped ids}` collapses to 1. UI faithfully renders "Showing 1 of 1 users".

The legacy `has_menu_access_override(uid, key)` SQL function only checks `menu_access_user_overrides` (per-user overrides), not `access_profile_menu_rights` (profile-granted), so reusing it would not help.

## Risk & Impact Report
- **Data**: Read-only RLS addition. No schema/data mutation. New SECURITY DEFINER function is SELECT-only.
- **Workflow**: Non-admin users with the `admin-users` profile grant gain visibility of profiles inside their Org-Level Scope only — exactly the documented intent. Admin/manager/HR/etc. paths unchanged.
- **UI/UX**: User Management now shows the scoped roster instead of just self for profile-granted users. No layout change.
- **Regression**: Other screens that read `profiles` are not narrowed — we only **add** a permissive policy; existing policies still apply (OR semantics).
- **Scalability**: New policy uses an `EXISTS` against `get_visible_employee_ids` (already indexed via `profiles.is_active`, FK joins). Cost is comparable to existing manager-skip-level policy. RPC results are cached on the client for 5 min.
- **Mitigation**: Guard with `is_active = true` and an explicit `has_profile_menu_access(uid,'admin-users','view')` check so the policy only activates for users who truly have the grant.

## Plan

### 1. DB migration (`supabase--migration`)

a. New SECURITY DEFINER helper:
```sql
public.has_profile_menu_access(_user_id uuid, _menu_key text, _action text)
-- _action ∈ ('view','add','update','delete')
-- EXISTS over access_profile_assignments → access_profiles (is_active)
--        → access_profile_menu_rights where menu_key=_menu_key and the
--        matching can_<action> column is true.
GRANT EXECUTE ... TO authenticated;
```

b. New permissive SELECT policy on `public.profiles`:
```sql
CREATE POLICY "Profile-granted users can view scoped active profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  is_active = true
  AND public.has_profile_menu_access(auth.uid(), 'admin-users', 'view')
  AND public.user_can_see_employee(auth.uid(), id)
);
```

c. No changes to existing policies; no GRANT changes (table already granted).

### 2. Client — no logic change required
The existing `useMyVisibleEmployeeIds` + `UserManagement.tsx` intersection logic continues to work; it simply receives a non-trivial roster from `useProfiles()` once RLS lets the rows through. Verify by reading current `useProfiles()` — keep as is.

### 3. Server-side write enforcement (out of scope, noted)
Add/Update/Delete still flow through the `admin-users` edge function which checks `has_role(admin)`. Granting non-admins write access through profile rights is a **separate ticket** and not included here — current behaviour (read-only for profile-granted users) is the documented Phase-1 outcome. UI already hides the Add/Edit/Delete buttons for non-admins via `effectiveRole` checks; double-check and add a small banner "View-only access" for profile-granted non-admins.

### 4. Tests
- `src/test/profileMenuAccessRls.test.ts` — pure predicate test mirroring `has_profile_menu_access` truth table (4 actions × granted/not granted).
- Extend `src/test/orgScopeVisibility.test.ts` — assert intersection behaviour: visibility set ∩ RLS-permitted roster.
- Manual QA SQL (documented in migration description): run `select count(*) from profiles` as Avinash via `set role`/JWT helper — expect 2,538.

### 5. Docs
- `DOCUMENTATION.md` → add §"Access-Profile RLS Bridge for User Management" describing the new function + policy.
- `POLICY.md` → new policy entry "Profile-Granted Read Visibility": *"A user with `access_profile_menu_rights.can_view = true` for `admin-users` may read any active profile inside their Org-Level Scope; writes still require `admin` role."*
- Append `mem/architecture/security/identity-access-console` (or sibling) with the bridge note.

## Technical notes (for engineers)
- Policies on `public.profiles` are evaluated with **OR** semantics across permissive policies; adding this one cannot reduce visibility for existing roles.
- `user_can_see_employee` already exists (created last migration) and short-circuits to `true` for admins, so the new policy is also safe if an admin happens to be reached through it.
- The `has_profile_menu_access` helper is generic — future RLS bridges for `kra-library`, `report-builder`, etc. can reuse it with a different `_menu_key`.

## Rollback
Single migration, fully reversible:
```sql
DROP POLICY "Profile-granted users can view scoped active profiles" ON public.profiles;
DROP FUNCTION public.has_profile_menu_access(uuid, text, text);
```
