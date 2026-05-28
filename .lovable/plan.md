
## Goal

Any non-admin user whose access profile grants **User Management** (`admin-users`) with View / Add / Update should be able to open the User Management page and see ONLY the employees that fall inside the **Org Level Scope** mapped on their access profile(s). Admins continue to see every employee.

## Current state

- Route `/admin/users` is already protected by `ProtectedRoute allowedRoles={['admin']} menuKey="admin-users"`. `ProtectedRoute` already lets a user through when `canAccess('admin-users')` is true via an access profile, so the *route* gating already works.
- `UserManagement.tsx` loads the full roster through `useProfiles()` → RPC `get_reviewer_roster_slim`. No filtering by the caller's access-profile org scope is applied — so a non-admin who is granted the menu would see every employee, which contradicts the Org Level Scope mapping.
- `access_profile_org_scope` rows can mix any of: `company_id`, `division_id`, `business_unit_id`, `department_id`, `location`, `designation`, `pms_grade`, `level`. Multiple rows per profile = OR. Within a single row, the populated fields = AND. Empty profile-scope (no rows) means "no employees" for that profile (admin gets all via the role bypass).

## Risk & Impact

- **Data Impact**: Read-only filter on the in-memory roster + a server-side filter helper. No schema change beyond adding one SECURITY DEFINER function.
- **Workflow Impact**: Admin behaviour unchanged. Non-admin profile-granted users now see a correctly scoped list (today they would either be blocked at the route or see everyone — both wrong).
- **Regression Risk**: Low. We only narrow the roster for non-admins; admin short-circuit preserved. Create/Update edge-function authorization is **out of scope** and continues to require admin (UI Add/Update buttons will still appear for profile-granted users, but the existing server check governs whether the action succeeds — flagged as follow-up).
- **Mitigation**: Unit tests on the scope-matching predicate; admin path explicitly tested.

## Plan

1. **DB — scope resolver RPC** (`supabase--migration`):
   - `public.get_user_org_scope_filters(p_user_id uuid)` → `SETOF access_profile_org_scope`-shaped rows, SECURITY DEFINER, returning every scope row from every active access profile assigned to the user.
   - `public.user_can_see_employee(p_user_id uuid, p_employee_id uuid)` → boolean, SECURITY DEFINER. Returns true if (a) caller is admin, or (b) at least one of the user's profile scope rows matches the target employee on every populated field. Used for future server-side enforcement and tests.
   - GRANT EXECUTE to `authenticated`.

2. **Client helper** — `src/lib/orgScopeFilter.ts`:
   - Pure function `matchesOrgScope(employee, scopeRows)` mirroring the SQL predicate (per-row AND across populated fields, OR across rows; empty rows → no match).
   - Pure function `filterRosterByScope(roster, scopeRows)`.
   - Full unit-test coverage in `src/test/orgScopeFilter.test.ts` (admin bypass, single-field row, multi-field AND, multi-row OR, empty scope, null fields on employee).

3. **Hook** — `src/hooks/useMyOrgScope.ts`:
   - Reads `access_profile_assignments` + `access_profile_org_scope` for `auth.uid()`, returns `{ scopeRows, isAdmin, isLoading }`. Auth-gated, 5-min staleTime, query key `['my-org-scope', userId]`.

4. **UI** — `src/pages/admin/UserManagement.tsx`:
   - Replace the raw `profiles` source with a memoised `scopedProfiles` computed from `useProfiles()` + `useMyOrgScope()` + `useAuth().effectiveRole`. Admin path returns the original list untouched.
   - Apply *before* the existing search / role / department / status filters and pagination so all counts and pages reflect the scoped roster.
   - Reuse the existing empty-state to show "No employees match the access profile scope assigned to you" when scope is non-empty but yields zero rows.

5. **Tests** — `src/test/orgScopeFilter.test.ts` covers the predicate; no UI test required (UI just composes the helper).

6. **Docs** — append section to `DOCUMENTATION.md` and `POLICY.md`:
   - POLICY §NEW: "Access-profile Org Level Scope governs which employees a non-admin User Management user can see. Admin role always sees the full roster."
   - DOCUMENTATION: describe the new RPC + helper + hook.

## Out of scope (called out explicitly)

- Server-side enforcement of Add / Update / Delete through the `admin-users` edge function for non-admin profile-granted callers. Today it requires admin; loosening it is a separate change with its own RLS/audit considerations. The new SQL helper (`user_can_see_employee`) is the building block for that future change.
- Filtering of the Manager picker, Department picker, etc. inside the Edit dialog.

## Verification

- Admin user: roster identical to today, all filters, counts, pagination unchanged.
- Non-admin user with profile granting `admin-users` View + a scope row `company_id = X`: only employees in company X appear; total count and pagination reflect the reduced list.
- Non-admin user with profile granting `admin-users` View but no scope rows: empty list with the new empty-state message.
- Unit tests for `matchesOrgScope` pass for all combinations listed in step 2.
