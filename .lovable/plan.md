## Assumptions
- Avinash is signed in as employee code `101732`.
- Employee `102028` should be visible through Avinash’s assigned `Onboarding` access profile.
- The screenshot is from the published/custom-domain app, so the fix must be safe for production and not rely on browser cache behavior.

## Clarifications
- Not Applicable. The issue is specific and reproducible from the current User Management behavior.

## Risk & Impact Report
- **Data Impact:** No destructive data change. I will only adjust read-path logic/migration functions if needed. Existing profile records and access profile assignments remain unchanged.
- **Workflow Impact:** User Management visibility will remain scoped by access profile. The change should only fix truncation so all scoped employees are reachable.
- **UI/UX Impact:** Counts and list results should change from `1000` to the full scoped count for Avinash; searching `102028` should return Brundaban Chandra Das.
- **Regression Risk:** Medium, because `useProfiles()` is shared by several admin/reviewer surfaces. I will avoid broad refactors and preserve existing return shape.
- **Scalability Impact:** Current symptom strongly indicates a 1000-row Data API/RPC cap in the User Management roster path. The fix must use explicit pagination for both roster rows and visible employee IDs.
- **Mitigation Plan:** Add targeted regression tests for paged visible IDs and paged roster counts, update docs/policy, and keep changes isolated to the User Management visibility path.

## RCA Findings
- Backend scope is correct: Avinash `101732` has the `Onboarding` profile, and `get_user_management_visible_employee_ids(Avinash)` includes employee `102028`.
- Backend scoped count is `2571`, but the UI shows exactly `1000`, which matches the platform’s default RPC row cap.
- `useMyVisibleEmployeeIds()` currently calls `get_user_management_visible_employee_ids` once without pagination, so the client can silently receive only the first 1000 visible employee IDs.
- `useProfiles()` already uses a paged helper for `get_reviewer_roster_slim`, but the visible-ID filter can still truncate the final scoped roster to 1000.

## Step-by-step Plan
1. **Fix visible-ID pagination**
   - Update `useMyVisibleEmployeeIds()` to fetch `get_user_management_visible_employee_ids` with `fetchAllRpcPaged`.
   - Keep admin behavior unchanged: admins still return `visibleIds = null` and do not filter.

2. **Harden User Management count source**
   - Ensure scoped stat cards derive from the fully paged scoped roster/visible IDs, not a capped single RPC response.
   - Keep page size at 10 for table display; only the backing roster should be fully paged.

3. **Add regression tests**
   - Test that `useMyVisibleEmployeeIds` uses paged RPC fetching.
   - Test that User Management still gates global stats to admins.
   - Test that the scoped roster/count logic is not allowed to rely on a single uncapped RPC call.

4. **Documentation and policy sync**
   - Update the relevant User Management documentation with the 1000-row cap RCA.
   - Update POLICY to require paged RPC reads for access-profile visibility lists.

5. **Verification**
   - Run the targeted test suite.
   - Re-check the DB visibility proof: Avinash `101732` includes employee `102028`, scoped count `2571`.
   - Confirm expected UI outcome: count no longer stuck at `1000`; search for `102028` returns the employee.

## UI Changes
- No layout redesign.
- User Management stat cards should show the full scoped count instead of `1000`.
- Search result behavior changes: employee `102028` should appear for Avinash.
- Responsiveness unchanged.

## Implementation
- Pending approval. No files will be edited in plan mode.

## Tests
- Add/adjust focused Vitest regression tests for the visibility pagination path.

## DOCUMENTATION.md updates
- Add a changelog entry documenting the scoped User Management 1000-row cap fix.

## POLICY.md updates
- Add/update policy requiring paged RPC calls for large access-profile visibility lists.

## Post-implementation notes
- If the user is testing on the custom domain, the fix must be published before it appears there; preview changes alone will not update `pms.bfclalloys.com`.
- Rollback strategy: revert the hook/test/doc changes; no data rollback required.