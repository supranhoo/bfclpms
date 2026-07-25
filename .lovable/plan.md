## 1. Assumptions
- The requested outcome is to make **Edit workflow & reviewers → REPLAN → Save** work for completed reviews such as Kiran Devi’s, without losing archived reviewer evidence or leaving a partially updated review.
- The intended reset follows the established completed-review rollback contract: clear `total_score`, `final_rating`, `criteria_weighted_score`, `finalized_at`, and `finalized_by` before reopening.

## 2. Clarifications
Not Applicable. The screenshot and live database state identify the failure precisely.

## 3. Risk & Impact Report
- **Data impact:** No schema or historical-row rewrite. Replace one backend function. A successful supersede will intentionally clear final aggregate fields while preserving/archive-copying locked responses according to the existing workflow.
- **Workflow impact:** Completed reviews can reopen to the first pending enabled reviewer stage. Kiran Devi’s requested Self → Dept → BU chain should move from `completed` to `pending_bu`.
- **UI/UX impact:** No visual changes. The existing dialog, REPLAN confirmation, warnings, reviewer selectors, and Save button remain unchanged.
- **Regression risk:** Medium because this path has already exposed sequential phantom-column errors. Mitigation is schema-derived contract testing plus a transactional live smoke test.
- **Scalability impact:** Negligible; the RPC locks and updates one instance and its relevant response/override rows. No unbounded read or new API load.
- **Security/RLS impact:** No permission expansion. Existing Admin/HR PMS authorization and audit logging remain.
- **Backup/data integrity:** No new table; normal automatic backup coverage remains unchanged. Failed calls are transactional, and Kiran Devi’s row is currently still `completed` with scores/finalization intact.
- **Rollback:** Restore the prior function definition. No data rollback is needed for the migration itself.

## 4. Step-by-step Plan
1. **Replace the faulty reset column**
   - Add a focused migration replacing `set_annual_review_enabled_stages(uuid,jsonb,text,text)`.
   - Remove nonexistent `completed_at` and use the real finalization fields `finalized_at` and `finalized_by`.
   - Preserve the verified canonical mapping, especially `dept_head → pending_dept` and `bu_head → pending_bu`.
   - Keep archive, override cleanup, audit, notification, authorization, and status logic otherwise unchanged.

2. **Add schema-aware regression protection**
   - Add a realistic completed-review fixture representing Kiran Devi’s Self → Dept review being extended to Self → Dept → BU.
   - Assert the final chronological function references only real `annual_review_instances` columns.
   - Assert the supersede reset clears `total_score`, `final_rating`, `criteria_weighted_score`, `finalized_at`, and `finalized_by`.
   - Assert it contains neither `weighted_final_score` nor `completed_at`.
   - Retain canonical role/status assertions, including `pending_dept` and `pending_bu`.

3. **Run targeted tests**
   - Run the new supersede-reset contract test.
   - Run `workflowStatusMapping.test.ts` and `editWorkflowRpc.contract.test.ts` to protect enum mapping and client RPC payloads.
   - Run the relevant Annual Review workflow test group to detect sibling regressions.

4. **Verify the deployed function and behavior**
   - Query the deployed function definition after migration and compare every referenced instance column to the live schema.
   - Perform a transaction-safe smoke test of the supersede path using a disposable/rollback test transaction where possible.
   - Confirm Kiran Devi remains unchanged before the user action: `completed`, score `74.00`, rating `Good`, and existing finalization metadata intact.
   - Then verify the real dialog flow: Save succeeds, status becomes `pending_bu`, Dept evidence is preserved, BU reviewer is Bijay Kumar Mandal, aggregate/finalization fields are cleared, and audit records are created.

5. **Audit sibling paths**
   - Recheck `reassign_annual_review_reviewer` and `annual_review_edit_workflow` for the same phantom-column category.
   - Confirm reviewer-only supersede already uses `finalized_at` and does not reintroduce invalid columns.

## 5. UI Changes
Not Applicable. Functional behavior only; responsiveness and layout remain unchanged.

## 6. Implementation
- One additive backend migration replacing the affected function.
- One focused regression test with mock scenario data.
- No unrelated refactor or schema addition.

## 7. Tests
- Success: completed Self → Dept review adds BU stage and reopens to `pending_bu`.
- Success: only real reset fields are cleared.
- Success: locked Dept response remains preserved when Dept remains enabled.
- Failure: invalid/noncanonical status mappings remain rejected by regression tests.
- Failure: any future phantom `annual_review_instances` reset column fails the static schema contract.
- Atomicity: failed operations leave scores, status, responses, and reviewer assignments unchanged.

## 8. DOCUMENTATION.md updates
- Add v2.66.169.2 RCA/CAPA entry describing why the first patch was incomplete, the corrected finalization fields, verification evidence, and rollback.
- Update version history in the same change.

## 9. POLICY.md updates
- Extend §AR-CANONICAL-ROLE-STATUS-MAPPING with a schema-truth invariant: completed-review supersede must clear only verified live columns and must clear both `finalized_at` and `finalized_by` when reopening.

## 10. Post-implementation notes
- **Verified root cause:** the previous repair removed `weighted_final_score` but retained another nonexistent field, `completed_at`. The live table uses `finalized_at` and `finalized_by`.
- **5 Why summary:** Save fails because the reset writes `completed_at`; it was copied from an obsolete/other-table convention; the first repair targeted only the reported phantom field; tests checked individual strings rather than the complete live schema contract; therefore sequential invalid-column failures escaped. CAPA is a full reset-column/schema contract, not another one-line symptom patch.
- Final confirmation will include targeted test results, deployed function inspection, and the observed Kiran Devi workflow state.