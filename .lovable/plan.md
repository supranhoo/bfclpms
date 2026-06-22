## Assumptions
- Sajid is still seeing the Team Reviews page fail with `Dashboard data could not be loaded` and zero employees.
- The earlier auth-readiness guards are present, but the current visible error can still be caused by a secondary dashboard query failure, not necessarily the roster query itself.
- Current backend logs did not show fresh `uuid "null"`, `uuid "undefined"`, `has_role`, or timeout errors in the last 2 hours, so I should not make a database permission change without stronger evidence.

## Clarifications
- Not Applicable.

## Risk & Impact Report
- **Data Impact:** No schema/data change planned. No RLS weakening; no anonymous permission grant.
- **Workflow Impact:** Team Reviews should stop collapsing the whole roster because a non-critical KPI/score/helper query failed.
- **UI/UX Impact:** Same screen; error banner becomes more accurate and scoped. If roster loads but KPI stats fail, employees should still be selectable instead of showing a full dashboard failure.
- **Regression Risk:** Medium, because the page combines many queries and one broad error flag currently drives the zero-state.
- **Mitigation Plan:** Add regression tests for the diagnostic decision tree and source-level guards; keep query behavior additive/fallback-based.
- **Scalability Impact:** Preserve existing paged/chunked fetch patterns. No full unbounded dataset loads added.

## Step-by-step Plan
1. **Identify and narrow the failing error condition**
   - Update the Team Reviews error-state logic so `data_load_error` is only triggered by roster-critical queries (`teamMembers`, `skipLevelMembers`, `profiles`, `stageFilteredProfiles`) and not by secondary KPI/submission score queries.
   - Keep secondary KPI failures visible but non-blocking where possible.

2. **Harden secondary query inputs**
   - Sanitize KPI/profile ID arrays before `.in(...)` lookups using the existing UUID validation pattern.
   - Apply this specifically to KPI relation hydration and submission-score fan-out paths that can receive stale or null IDs.

3. **Make the page recover gracefully**
   - If KPI or submission score reads fail, return safe empty maps/lists where the roster can still render, and show the existing refresh affordance rather than replacing the roster with a fatal state.
   - Keep fatal behavior only when the employee roster itself cannot be read.

4. **Add targeted diagnostics that will be visible if the issue persists**
   - Add a small source-level diagnostic around the Team Reviews query status object so future console captures show exactly which query failed (`team`, `skip`, `profiles`, `stage`, `kpis`, or `submissionScores`).
   - Avoid logging secrets or full payloads.

5. **Tests**
   - Extend `teamReviewsZeroDiagnostic.test.ts` to confirm KPI-only failures do not produce the full `data_load_error` branch.
   - Add/extend a source regression test to ensure ID arrays are filtered before `.in('id', ...)` / `.in('kpi_id', ...)` calls in the dashboard feed.

6. **Documentation.md updates**
   - Add a version-history note explaining that Team Reviews roster availability is separated from non-critical KPI/stat query failures.

7. **Policy.md updates**
   - Add/update the Team Reviews dashboard policy: roster-critical failures may block the grid; non-critical metric failures must degrade gracefully and must not hide employees.

8. **Post-implementation verification**
   - Run the targeted Team Reviews tests.
   - Use live preview/log signals to verify the banner no longer appears for a secondary query failure and that the roster can render independently.

## UI Changes
- **Location:** Team Reviews dashboard error/zero-state area.
- **Visual change:** No redesign. The existing fatal dashboard banner should appear only when the roster cannot load; non-critical stat issues should not replace the team member grid.
- **Interaction impact:** `Refresh roster` remains available. Employee cards should remain selectable if roster data exists.
- **Responsiveness:** No layout changes.

## Implementation
- Pending approval.

## Tests
- Pending approval: targeted Vitest/source tests only.

## DOCUMENTATION.md updates
- Pending approval.

## POLICY.md updates
- Pending approval.

## Post-implementation notes
- Rollback is straightforward: revert the Team Reviews error-scope and sanitization changes. No database rollback required.