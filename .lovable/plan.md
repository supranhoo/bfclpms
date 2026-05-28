## Assumptions
- The issue is on **System Settings → Menu Access → Assignment**.
- Employee assignment should use existing `profiles` data only; no new employee/master-data table is required.
- Inactive employees should remain hidden from assignment search unless **Include inactive** is checked, but existing assignments must still display the employee name.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** No schema change planned. I checked the backend data: `access_profile_assignments` has 5 rows, all 5 match existing `profiles`; `profiles` has 2,548 rows, 2,538 active, and no missing `full_name`. Search text `upen` matches 9 active employees. So the table/data is not missing.
- **Workflow Impact:** No change to permissions or assignment rules. This only fixes employee lookup/display reliability.
- **UI/UX Impact:** Existing UI remains the same. Search results should appear correctly, and assignment rows should show employee name/code instead of `Unknown`.
- **Regression Risk:** Low-to-medium because this touches profile fetch timing in an admin settings tab.
- **Scalability Impact:** Keep paged profile fetching via `fetchAllPaged()` to avoid the 1000-row backend cap for the 2,548-row employee roster.
- **Mitigation Plan:** Add auth-readiness query gating, keep paging, add regression tests for empty-cache/auth-ready behavior and `Unknown` prevention.

## Root Cause
The database rows exist. The likely logic issue is that `AssignmentTab` runs the employee profile queries immediately, before the authenticated session is ready. With row-level access rules, that can return an empty profile list, which is cached for 5 minutes. Result:
- assignment table still loads assignment rows,
- employee lookup map is empty,
- UI shows `Unknown`,
- search dropdown shows `No results`.

## Step-by-step Plan
1. **Gate employee profile queries by auth readiness**
   - In `AccessProfilesManager.tsx`, update `AssignmentTab` to use the existing auth readiness pattern.
   - Only run active/all profile queries when auth is ready and a user exists.
   - Include `user.id` and profile version in the query keys so stale empty results do not persist after login/profile imports.

2. **Keep large-roster paging intact**
   - Continue using `fetchAllPaged()` for both active profiles and assignment-display profiles.
   - Keep `eq('is_active', true)` for default assignment picker search.

3. **Improve assignment display fallback safely**
   - Keep display priority as employee full name, then email, then employee code, then `Unknown` only if the profile truly cannot be found.
   - Existing assigned inactive users should still resolve from the all-profiles enrichment query.

4. **Add tests**
   - Add/update regression coverage for profile assignment lookup:
     - active employee beyond 1000 rows appears in search,
     - assigned employee display resolves name/code when present,
     - empty pre-auth fetch should not be treated as final data,
     - inactive assigned employee can still display in assignment table.

5. **Documentation updates**
   - Update `DOCUMENTATION.md` to note Menu Access assignment uses authenticated, paged `profiles` queries.
   - Update `POLICY.md` to reinforce that profile assignment employee pickers must use auth-ready, paged profile fetches and must not cache unauthenticated empty results.

## UI Changes
- **Visual location:** System Settings → Menu Access → Assignment.
- **Visual change:** No redesign. Existing dropdown/table should populate correctly.
- **Interaction impact:** Searching `upen` should show matching employees; assigned rows should show employee names instead of `Unknown`.
- **Responsiveness:** Not affected.

## Implementation
Pending approval. No files changed in plan mode.

## Tests
Will add targeted unit/regression tests as above.

## DOCUMENTATION.md updates
Will update in the implementation step.

## POLICY.md updates
Will update in the implementation step.

## Post-implementation notes
After implementation, I will verify the relevant code path and confirm the data check: backend data exists, and the fix is in the profile query timing/cache behavior rather than missing tables.