## Assumptions
- “HR Team” means active users who belong to the configured HR Business Unit via `profiles.department_id → departments.business_unit_id`.
- The missing option is the Team Annual Review / All employees entry used to open or start Annual Review forms for submission assistance.
- HR-Team users may not have the static `hr_pms` role; they can be normal `employee` users in the HR BU.

## Clarifications
- Not required before implementation; the reported behavior maps to a clear gate mismatch.

## Risk & Impact Report
- **Data Impact:** No table/schema changes expected. One backend function/RLS adjustment may be needed only if direct detail access still fails for HR-Team users after navigation.
- **Workflow Impact:** Expands visibility to the already-approved HR-Team directory/submission workflow; does not give all employees access.
- **UI/UX Impact:** HR-Team users will see the Annual Reviews (Team) navigation entry and can open the directory button from the Team Annual Review page.
- **Regression Risk:** Medium, because route/sidebar role gates are shared. Mitigation is to gate HR-Team dynamically through the existing server resolver, not by adding broad static employee access.
- **Scalability Impact:** No unbounded data reads. Existing Team page pagination and directory search limit remain unchanged.

## Step-by-step Plan
1. **Create a dynamic Annual Review Team access gate**
   - Add a small hook/component wrapper that calls `useDirectoryAccess()` and allows Team Annual Review routes when either:
     - the user already matches existing reviewer/admin roles, or
     - the backend resolver returns `canAccess = true` for HR-Team/BU/HOD directory access.
   - Keep fail-closed behavior while loading/erroring.

2. **Fix route access**
   - Replace the static-only `ProtectedRoute` gate for:
     - `/annual-review/team`
     - `/annual-review/team/:instanceId`
     - `/annual-review/calibrate` only if the calibration page is needed from the Team entry; otherwise leave calibration unchanged.
   - Avoid granting generic `employee` access directly through `ProtectedRoute` unless the dynamic resolver also approves.

3. **Fix sidebar visibility**
   - Update `AppSidebar` so HR-Team users approved by `useDirectoryAccess()` can see the Annual Reviews (Team) link.
   - Keep the link hidden for ordinary employees outside HR BU.
   - Existing static roles (`admin`, `manager`, `skip_level`, `hr_pms`, `management`) remain unchanged.

4. **Backend/RLS check for detail access**
   - Review whether HR-Team users can read `annual_review_instances`, `annual_review_responses`, and proxy audit rows for assisted submission.
   - If RLS blocks the form after the route is visible, add a narrow migration using the existing backend resolver:
     - allow HR-Team all-scope users to view/open Annual Review instances needed for assistance;
     - preserve BU-scoped limits for BU Head/HOD;
     - keep sensitive writes behind existing RPC checks.

5. **Tests**
   - Add/extend unit tests for the dynamic route/sidebar access logic:
     - HR-Team resolver-approved employee sees Team Annual Review access.
     - Ordinary employee without resolver access does not.
     - Existing `hr_pms`/admin access still works.
   - If RLS function changes are required, add a SQL regression note and keep audit/security behavior unchanged.

6. **Documentation and Policy updates**
   - Update `DOCUMENTATION.md` version history to state that HR-Team visibility now uses the server directory resolver at route/sidebar level.
   - Update `POLICY.md` §AR-DIRECTORY-ACCESS-MATRIX to clarify UI entry visibility must use the same resolver, not only static roles.

## UI Changes
- **Location:** Left sidebar → Manager section.
- **Visual change:** HR-Team users will now see `Annual Reviews (Team)` when Annual Review is enabled.
- **Interaction impact:** Clicking it opens the existing Team Annual Review page; the existing `All employees` button remains the form-finding/submission-assistance entry.
- **Responsiveness:** No layout change; same existing sidebar behavior on desktop/mobile.

## Implementation
- Add a minimal dynamic access wrapper/hook and wire it into `App.tsx` + `AppSidebar.tsx`.
- Only add a backend migration if read access is confirmed to block the opened form.

## Tests
- Add focused tests around route/sidebar access decisions and retain existing directory/proxy tests.

## DOCUMENTATION.md updates
- Add a new version-history entry for the HR-Team route/sidebar visibility fix.

## POLICY.md updates
- Amend §AR-DIRECTORY-ACCESS-MATRIX with a route/sidebar UI gate rule.

## Post-implementation notes
- Rollback: remove the dynamic gate wiring and restore the previous static route/sidebar role lists; no data rollback expected unless an RLS migration is needed.