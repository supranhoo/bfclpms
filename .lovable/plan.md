## Assumptions
- The screenshot is from a manager moving a KPI from Self Review to Manager Check.
- Recipient `3d06ca4d-42f3-4704-9f60-fade01ad2d1e` is Mayank (`Auditor002`), an active auditor.

## Clarifications
- Not required; the failing database path and recipient are confirmed.

## RCA and 5 Why
1. The KPI status update fails because its notification insert is rejected by the sender-relationship guard.
2. The rejected recipient is Mayank, who is not necessarily assigned to the KPI being updated.
3. `notify_on_kpi_status_change()` currently sends “KPI Ready for Audit” to **every user with the auditor role**, rather than only the KPI’s assigned auditor(s).
4. ADR-131 correctly authorized reviewer↔**assigned auditor** relationships, but it did not change this legacy global fan-out.
5. Therefore, when the broadcast reaches the first unrelated auditor, authorization fails and rolls back the parent KPI status update. This is the same notification-guard failure class as ADR-112/131, but a different root cause: invalid recipient selection rather than a missing valid authorization edge.

## Risk & Impact Report
- **Data:** No destructive changes or historical-data rewrite. Notification recipient selection only.
- **Workflow:** Manager approval/N/A/status transitions will stop failing; only assigned auditors will receive audit-ready notifications.
- **Security:** Improves least privilege by preventing unrelated auditors from receiving employee KPI details. The guard remains strict; no broad authorization bypass.
- **UI/UX:** No layout change. Existing error toast disappears when the status transaction succeeds.
- **Regression:** Other status transitions could share this trigger; preserve employee, manager, finalization, and send-back notifications unchanged.
- **Scalability:** Replaces organization-wide role fan-out with indexed assignment-based recipient lookup, reducing inserts and database load.
- **Backup:** No new table; existing automatic public-table backup coverage is unchanged.
- **Rollback:** Restore the previous trigger function definition through a forward migration; no data rollback required.

## Step-by-step Plan
1. Add a forward-only database migration redefining `notify_on_kpi_status_change()`.
2. Replace the global `user_roles.role='auditor'` fan-out with the union of active, login-enabled auditors assigned through:
   - `audit_kpi_level_assignments` for the specific KPI, and
   - `audit_kpi_assignments` for the KPI’s employee.
3. Deduplicate recipients and retain the existing auth-user check and best-effort notification handling.
4. Keep `can_send_notification_to()` unchanged: it already authorizes both confirmed assignment relationships.
5. Audit sibling KPI notification paths for any other role-wide recipient broadcasts and correct only equivalent invalid fan-outs found in the active definitions.
6. Add regression tests proving:
   - assigned KPI-level auditor receives the notification;
   - assigned employee-level auditor receives it;
   - unrelated auditors do not receive it;
   - duplicate assignments produce one notification;
   - status updates are not rolled back by unrelated auditors;
   - all existing status notification branches remain present.
7. Update realistic notification relationship fixtures/mock data for assigned and unrelated auditors.
8. Update `POLICY.md`, `DOCUMENTATION.md` version history, and add an ADR/CAPA note documenting assignment-scoped auditor dispatch.
9. Apply the migration and verify the active function definition plus assignment counts. No replay/backfill is needed because failed transactions rolled back cleanly; affected users can retry.

## UI Changes
- Not Applicable.

## Implementation
- Database trigger correction, regression fixtures/tests, and synchronized documentation only.

## Tests
- Targeted Vitest notification-trigger contract tests.
- Database verification of the deployed function and recipient query behavior.

## DOCUMENTATION.md updates
- Record the confirmed RCA, affected flow, implementation, validation, rollback, and version-history entry.

## POLICY.md updates
- State that audit-ready KPI notifications are assignment-scoped and must never be broadcast to every auditor.

## Post-implementation notes
- This resolves the remaining gap without weakening notification authorization or exposing KPI data to unrelated auditors.