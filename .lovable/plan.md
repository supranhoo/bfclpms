## 1. Assumptions
- The uploaded screenshot corresponds to the database error recorded at **2026-07-17 07:12:02 UTC**.
- Ayush/Pankaj used the production-facing assisted-submission workflow.
- The current live definition of `public.can_send_notification_to` is already corrected and contains no `k.*` references.

## 2. Clarifications
Not Applicable — the exact error and affected workflow are visible in the screenshot.

## 3. Risk & Impact Report
- **Data:** No table or historical-row mutation is expected; repair only stale database execution state or the remaining routine discovered by the audit.
- **Workflow:** Assisted Submission Verification and any cross-user notification insert may currently fail for ordinary users.
- **UI/UX:** No visual change; the raw `column k.manager_id does not exist` toast should disappear.
- **Regression:** Medium until the exact executing routine/session is isolated. A broad schema search found no current function/view source containing `k.manager_id`, indicating either a cached pre-replacement PL/pgSQL plan or an execution environment mismatch.
- **Scalability:** Unchanged; no additional steady-state queries or API calls.
- **Mitigation:** Inspect all live routines/triggers and migration history, deploy a cache-invalidating replacement only after confirmation, add schema-truth regression coverage, and run a real authenticated smoke test.
- **Rollback:** Reapply the immediately preceding valid function definition; no data rollback required.

## 4. Step-by-step Plan
1. **Identify the exact live execution path**
   - Correlate the 07:12 errors with database statement/context logs.
   - Inspect function dependencies, trigger bindings, overloads, and applied migration records—not only source text search.
   - Confirm whether preview and published/custom-domain traffic use the same backend environment.
2. **Apply the narrow backend correction**
   - If another routine contains the invalid alias, replace only that routine using authoritative profile/audit-assignment relationships.
   - If the live catalog is correct but a pooled session retained the old PL/pgSQL plan, force safe function-plan invalidation by replacing the function through a new migration; restart the backend only if invalidation cannot clear the stale execution state.
3. **Strengthen regression protection**
   - Extend the existing notification relationship fixture/test to scan every migration/function definition participating in notification inserts and reject all nonexistent qualified columns, including `k.manager_id`.
   - Include success and failure fixtures: valid profile/auditor relationships pass; legacy KPI reviewer aliases fail.
4. **Verify the actual user flow**
   - Run the focused test.
   - Execute Assisted Submission Verification as an authenticated non-admin user and confirm submission advancement plus recipient notification.
   - Recheck database logs for zero new `k.manager_id`/`42703` errors after the test.
5. **Synchronize governance records**
   - Update ADR-107, `DOCUMENTATION.md`, and `POLICY.md` with the true second-order cause, correction, verification timestamp, and rollback.

## 5. UI Changes
Not Applicable.

## 6. Implementation
Pending approval.

## 7. Tests
- Static schema-reference regression across all notification-path routines.
- Valid relationship happy path.
- Legacy invalid KPI alias rejection case.
- Authenticated assisted-submission smoke test and post-test log check.

## 8. DOCUMENTATION.md updates
Record the corrected root cause, deployed function state, migration, live verification evidence, and version-history entry.

## 9. POLICY.md updates
Require catalog-level schema validation across the full trigger/function dependency chain and post-deployment non-admin smoke testing for notification guards.

## 10. Post-implementation notes
- Earlier remediation fixed `can_send_notification_to`, and the live catalog now shows that corrected body.
- The remaining error therefore cannot be closed by another blind column rename; the exact stale execution path must be invalidated or removed and verified through the real workflow.