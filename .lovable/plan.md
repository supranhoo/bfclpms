## 1. Assumptions
- The screenshot’s `column d.head_id does not exist` toast is the current blocker after clicking **Verify & Submit**.
- The uploaded photograph is valid; media capture/upload is not the failing step.

## 2. Clarifications
- Not Applicable; the failure and intended behavior are unambiguous.

## 3. Risk & Impact Report
- **Data impact:** No schema or historical-row changes. The failed transaction should have rolled back the review transition and notification together. Confirm the instance remains pending before repair.
- **Workflow impact:** Restores assisted Annual Review submission and other legitimate cross-user notifications. Authorization remains relationship-based.
- **UI/UX impact:** No visual change; the existing dialog should submit successfully instead of showing the database error.
- **Regression risk:** Medium. The live helper was repaired earlier, but migration `20260717120422...` later overwrote it with an obsolete definition containing `departments.head_id` and nonexistent KPI reviewer columns.
- **Scalability impact:** Neutral; retain indexed relationship lookups and bounded `EXISTS` checks.
- **Mitigation:** Replace the helper with the already schema-valid relationship model, add deployment-order-aware regression coverage, verify the live function body and both allow/deny cases.
- **Rollback:** Reapply the immediately preceding schema-valid helper definition; no data rollback is required.

## 4. Step-by-step Plan
1. Add one corrective backend migration that replaces `can_send_notification_to` with the schema-valid bidirectional matrix:
   - use `departments.head_user_id`, never `head_id`;
   - use profile/org-master relationships for manager, skip, department head, and BU head;
   - use real audit-assignment tables rather than nonexistent KPI reviewer columns;
   - preserve Annual Review employee↔reviewer and reviewer-peer authorization;
   - preserve authenticated/backend execution only.
2. Verify the affected review instance is still pending and no partial proxy audit/submission state was committed.
3. Test the actual affected sender/recipient authorization, an unrelated-user denial, and inspect the deployed function definition for forbidden columns.
4. Update regression fixtures/tests so the newest migration can never reintroduce `d.head_id` or invalid `kpis` aliases, regardless of migration ordering.
5. Synchronize RCA/CAPA documentation and policy version history.

## 5. UI Changes
- Not Applicable.

## 6. Implementation
- One additive `CREATE OR REPLACE FUNCTION` migration only; no table changes, destructive statements, or client workaround.
- Root cause: a later timestamped migration reintroduced the obsolete function after the earlier repair, so source tests and documentation described a fixed state while the live database was regressed.

## 7. Tests
- Update `notificationsSenderRelationshipSchema.test.ts` and its realistic relationship mock fixture.
- Cover valid upward/downward Annual Review relationships, reviewer-peer access, unrelated-user denial, forbidden-column detection, and anonymous execution revocation.
- Run the focused test suite and live read-only verification queries.

## 8. DOCUMENTATION.md updates
- Add a version-history entry documenting the migration-order regression, live-state verification, rollback, and CAPA.

## 9. POLICY.md updates
- Reaffirm the notification schema-truth rule and require the final chronological function definition—not merely an earlier valid migration—to pass schema-reference tests.

## 10. Post-implementation notes
- Confirm backup coverage remains automatic; no new table is introduced.
- Report the final review status and authorization checks without exposing employee-sensitive data.