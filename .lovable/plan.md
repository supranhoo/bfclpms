## Assumptions
- Avinash is truly logged in as employee code `101732` on the published site.
- Employee `102028` should be visible through the existing Onboarding access profile and org scope.
- This is a User Management visibility bug, not a request to widen permissions.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** No schema change expected. Existing access profiles, scope rows, roles, and employee data remain unchanged.
- **Workflow Impact:** User Management access stays governed by `admin-users / view` plus access-profile org scope; no permission widening.
- **UI/UX Impact:** The table should no longer show `0 of 0` when the backend says scoped employees exist. Stat cards should stop misleading non-admin users by showing global counts when their table is scoped.
- **Regression Risk:** Medium, because `useProfiles()` is shared by multiple admin/reporting surfaces. Changes must be limited to User Management recovery/scoped stats and auth cache invalidation.
- **Scalability Impact:** Keep existing paged RPC fetching. Do not load raw `profiles` blindly. Stats should derive from the already paginated roster for scoped viewers, and only full-access users should use head-count queries.
- **Mitigation Plan:** Add focused tests for cache invalidation/scoped filtering and keep backend policy unchanged.

## RCA Findings
- Database access is correct for Avinash `101732`:
  - `has_profile_menu_access(101732, 'admin-users', 'view') = true`
  - `get_user_management_visible_employee_ids(101732)` returns `2571` rows
  - It includes employee `102028`
  - Simulated `get_reviewer_roster_slim()` for Avinash returns `2571` rows and includes `102028`
- Therefore the issue is not the Onboarding profile mapping or employee `102028` scope.
- The screenshot shows `0 of 0` while cards show `2571`, which points to a frontend/session/cache mismatch: global stat head-counts succeed, but the roster query used by the table is empty/stale.

## Step-by-step Plan
1. **Auth cache recovery**
   - Add `my-visible-employee-ids` to the post-auth-ready invalidation list in `AuthContext`.
   - Ensure User Management scoped visibility re-fetches after login/session bootstrap, not from a stale pre-auth empty result.

2. **User Management scoped stats alignment**
   - For non-admin/profile-scoped users, derive Total/Active/Inactive/Admin counts from the visible roster instead of raw global `profiles` head-counts.
   - Keep global head-count queries only for full-access/admin users.

3. **Blank roster guard**
   - Add a narrow recovery path in User Management: if auth is ready, stat count/visible scope indicates rows exist, but `profiles` is empty, trigger a refetch and show a loading/retry state instead of final `0 of 0`.
   - Do not add new permissions or expose hidden rows.

4. **Tests**
   - Add/extend unit tests to verify:
     - auth-ready invalidation includes both `profiles` and `my-visible-employee-ids`
     - scoped stats are computed from visible roster, not global head-counts
     - search for a visible employee code is not suppressed by an empty stale visibility set

5. **Documentation updates**
   - Update `DOCUMENTATION.md` for User Management visibility flow and cache recovery.
   - Update `POLICY.md` to state scoped users’ User Management cards must reflect scoped roster, not global counts.

## UI Changes
- **Location:** `/admin/users`, User Management page.
- **Visual change:** For scoped/non-admin users, the four stat cards will match the employees visible in the table.
- **Interaction impact:** Searching `102028` should return the employee for Avinash `101732` once the roster loads.
- **Responsiveness:** No layout changes; existing responsive card/table behavior remains.

## Implementation
Pending approval. No code will be changed in plan mode.

## Tests
Pending approval; focused unit tests will be added/updated as above.

## DOCUMENTATION.md updates
Pending approval; will document the scoped User Management roster and recovery behavior.

## POLICY.md updates
Pending approval; will document scoped stats parity and no global count leakage for scoped users.

## Post-implementation notes
- Rollback is simple: revert the frontend cache/stat changes; no data migration is involved.
- Immediate operational workaround: ask Avinash to hard refresh/sign out and back in, but the code fix should make that unnecessary.