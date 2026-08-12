# TNI Report Zero-Record RCA and CAPA

## Assumptions
- Reproduction range: April–June 2026, threshold `2.00`, minimum `3` scored months.
- Existing TNI continuity policy remains unchanged: every scored month must be at or below the threshold.
- “Backfill” must not be required to make qualified report rows visible.

## Verified RCA
- The database qualification function returns **252 qualifying employee/KPI rows across 98 employees** for the exact failing filter.
- The screenshot still shows the obsolete “1,000 detected records were excluded” message. Current source no longer contains that message and is designed to render qualification rows independently of detection records. The running UI is therefore not executing the complete ADR-254 report path.
- The qualification function is currently security-invoker and reads RLS-protected KPI/submission tables. Its result can differ by the viewer’s session even though the privileged database check returns 252.
- The black **Backfill Range (3)** action runs monthly detection three times and creates persistent TNI action records. It is an enrichment/action workflow, not a reporting prerequisite. It is currently exposed to every TNI report viewer despite performing writes.
- Profile-fetch errors are not included in the visible report error state, and the empty-period notice still implies detection is required for reporting.

## Risk & Impact Report
- **Data impact:** No KPI, score, submission, or historical TNI row will be changed by loading the report. The existing backfill write remains available only as an explicit Admin action.
- **Workflow impact:** Qualified rows appear immediately from score evidence. Detection records continue to add priority, status, recommendation, and workflow state.
- **Permissions/RLS:** The read RPC will use explicit authenticated/report-access checks and employee scope; it will not become an unrestricted data bypass. Backfill becomes Admin-only.
- **UI/UX impact:** Remove misleading detection-required guidance; relabel and explain the Admin action. Existing filter/table layout remains unchanged and responsive.
- **Regression risk:** Medium because TNI supports Admin, Management, Manager, and user overrides. Mitigate with access-matrix, qualification, loading/error, and merge tests.
- **Scalability:** Keep qualification server-side; return one row per qualified employee/KPI. Retain paged detection enrichment and chunked profile lookup. No full unbounded client read is introduced.
- **Backup/data integrity:** The read fix creates no table. Existing `training_needs` remains covered by automatic backup discovery.
- **Rollback:** Restore the prior qualification function and UI action label/visibility. No data rollback is required.

## Step-by-step Plan
1. **Harden the qualification read endpoint**
   - Convert `tni_qualified_kpis` to an authenticated, fixed-search-path reporting function.
   - Enforce TNI report access and explicit employee/KPI scope inside the function, preserving full access only for authorized broad-report roles and limiting managers to their permitted rows.
   - Preserve the current continuity formula and response shape.
   - Revoke anonymous/public execution and grant execution only to authenticated/backend roles.
   - Verify the exact failing filter still returns 252 rows for an authorized broad-report user and remains scoped for managers.

2. **Make report state truthful**
   - Include threshold, continuity-setting, qualification, detection-enrichment, and profile-fetch failures in one visible destructive error state.
   - Ensure qualified rows render even when detection records are empty or profile enrichment partially fails.
   - Replace the obsolete empty-month warning with wording that detection creates action records but is not needed to calculate the report.
   - Keep summary cards, charts, detail rows, and export derived from the same qualified set.

3. **Clarify and restrict the black action**
   - Show the action only to Admin.
   - Rename **Backfill Range (3)** to **Create Action Records (3 months)** with a tooltip explaining that it persists TNI workflow records for priority/status/recommendation management; it does not calculate report eligibility.
   - Keep the existing per-month mutation, audit attribution, cache invalidation, progress/error feedback, and non-destructive insert behavior.

4. **Regression protection and verification**
   - Add realistic mocks for 252 qualifications, missing detection rows, profile-enrichment failure, manager-scoped access, and unauthorized access.
   - Add success/failure tests for endpoint authorization, merge behavior, error visibility, and Admin-only action rendering.
   - Verify Apr–Jun 2026 in the running UI: 252 qualifying KPI rows, 98 affected employees before employee-status filtering, month columns Apr/May/Jun, and no detection-required zero state.

## UI Changes
- **Header:** Admin-only action renamed from “Backfill Range (3)” to “Create Action Records (3 months)” with an explanatory tooltip.
- **Continuity banner:** Shows qualification/action-record counts without suggesting that action records control visibility.
- **Error/empty state:** Distinguishes calculation failure, enrichment failure, no qualifying KPI, and no persisted action records.
- **Responsiveness:** Existing horizontal month-column scrolling and wrapped header actions remain intact.

## Tests
- Qualification endpoint: exact threshold, minimum-month gate, authenticated broad access, manager scope, unauthorized denial.
- UI/service: qualified-without-detection rows, profile failure surfaced, stale range rejected, Admin-only action, no obsolete “excluded” banner.
- Existing ADR-252/253/254 TNI suites remain green.

## DOCUMENTATION.md Updates
- Add the confirmed live counts, session/RLS RCA, secure read contract, revised action meaning, verification evidence, and rollback notes to Version History.

## POLICY.md Updates
- Extend §PMS-CONTINUITY-AT-OR-BELOW: report qualification is independent of detection persistence; report reads must be explicitly scoped; persistent action-record generation is Admin-only.

## Post-implementation Notes
- No backfill will be run automatically and no historical TNI data will be rewritten.
- The “Backfill” terminology will be retired from the report because it incorrectly suggests missing report data must be repaired.
