## Assumptions
- The screenshot is Sajid Raza in non-full-access Manager → Team Reviews.
- The backend is healthy; recent logs show no fresh UUID/permission/timeout database errors.
- Sajid still has 13 active direct reports in the database, so the UI is incorrectly treating an auxiliary query as roster-fatal.

## Clarifications
- Not Applicable.

## Risk & Impact Report
- **Data Impact:** No schema, RLS, historical data, audit, or backup changes.
- **Workflow Impact:** Manager Team Reviews should load from direct + skip-level roster only; Admin/HR PMS/Audit/Management views keep existing org-wide behavior.
- **UI/UX Impact:** Same visual layout. The fatal dashboard block will appear only when the actual manager roster queries fail; otherwise Sajid’s employee cards should render.
- **Regression Risk:** Low-to-medium because `EmployeeSelectorGrid` is shared across reviewer dashboards.
- **Scalability Impact:** Improves manager load path by avoiding unnecessary org-wide profile/RPC dependency; existing pagination/windowing remains unchanged.
- **Mitigation Plan:** Add source-level regression tests for manager Team view query gating and fatal-error scoping.
- **Rollback Strategy:** Revert the small `EmployeeSelectorGrid` gating changes and related tests/docs.

## Step-by-step Plan
1. **Separate roster-critical errors by role/view**
   - For non-full-access `viewLevel === 'team'`, treat only `teamError` and `skipError` as fatal.
   - Do not let `profilesError` or `stageFilteredError` blank manager Team Reviews when those queries are not the roster source.

2. **Stop unnecessary org-wide profile fetch for manager Team Reviews**
   - Change `useProfiles()` to accept an `enabled` option.
   - In `EmployeeSelectorGrid`, enable `useProfiles()` only when the current view actually needs all profiles: full-access views, cross-check/explorer, or KPI deep-link auto-open.
   - Manager Team view will rely on `teamMembers + skipLevelMembers` only.

3. **Guard stage-filtered roster fetch**
   - Change `useProfilesByWorkflowStage()` to accept an `enabled` option.
   - Enable it only when `requiredStage` exists and the current view actually uses stage-filtered profiles.

4. **Keep secondary KPI failures non-blocking**
   - Preserve the current toast-only handling for KPI/submission score errors.
   - Keep employee roster rendering even if KPI stat data is unavailable.

5. **Tests**
   - Extend/add regression tests verifying:
     - Manager Team view does not pass `profilesError`/`stageFilteredError` into `data_load_error`.
     - `useProfiles()` and `useProfilesByWorkflowStage()` support `enabled` gates.
     - Manager Team view uses direct/skip roster hooks as the only fatal roster dependencies.

6. **DOCUMENTATION.md updates**
   - Add a version-history note documenting this RCA: manager Team Reviews must not depend on org-wide profile/stage queries.

7. **POLICY.md updates**
   - Add/update the Team Reviews policy: non-full-access manager roster source is direct + skip-level only; auxiliary profile/KPI/stage queries must not blank the roster.

## UI Changes
- **Exact location:** `/dashboard?view=team`, Team Reviews panel.
- **Visual change:** No redesign; Sajid should see employee cards instead of the “Dashboard data could not be loaded” block when direct/skip roster queries succeed.
- **Interaction impact:** Refresh/Retry remains unchanged.
- **Responsiveness:** Not Applicable; layout unchanged.

## Implementation
- Completed: `EmployeeSelectorGrid` now gates org-wide profile/stage queries and scopes manager Team Reviews fatal errors to direct/skip roster hooks only.

## Tests
- Completed: `src/test/teamReviewsManagerRosterQueryGate.test.ts` added for enabled gates and manager fatal-error scoping.

## DOCUMENTATION.md updates
- Completed: `DOCUMENTATION.md` now records v2.66.37 RCA and fix.

## POLICY.md updates
- Completed: `POLICY.md` §131 now defines manager Team Reviews direct+skip roster source and auxiliary-query non-fatal behavior.

## Post-implementation notes
- I found the database still has Sajid’s 13 active direct reports and the hosted backend is responding normally, so the next fix should be in the Team Reviews query-gating path, not the database.