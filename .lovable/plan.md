## 1. Assumptions
- "HRMS PMS" in the dropdown = the `hr_pms` viewer stage of the Bulk Review Dashboard.
- The HR PMS user has the `hr_pms` app role and is selecting "Common KPI 5S" rows.
- Per project convention, `status` = last COMPLETED stage. HR PMS should only act on rows whose last-completed stage is the one immediately preceding `hr_pms_review` in that KPI's resolved workflow (typically Auditor or Manager, depending on template).
- The user wants stage-aware visibility, not just role-aware visibility.

## 2. Clarifications (non-blocking)
- Should HR PMS see KPIs that are already past `hr_pms_review` (Management / Final) as read-only history? Default in this plan: no — Bulk Review only shows actionable rows for the selected viewer stage. They remain visible in other dashboards.
- Should KPIs in `sent_back` state be re-surfaced to HR PMS only after the previous stage re-completes? Default: yes.

## 3. Risk & Impact Report
- **Data Impact:** No data mutation. Only the `my_review_scope` RPC and the Bulk Review filter behavior change.
- **Workflow Impact:** HR PMS and Management bulk views will tighten: rows pending earlier stages disappear from their bulk grid until the prior stage completes.
- **UI/UX Impact:** No new UI, but row counts will drop. We'll add a tooltip on the "My scope only" toggle explaining "stage-ready rows only".
- **Regression Risk:** Medium. Other surfaces also call `my_review_scope`. We'll keep the function signature stable and only tighten the predicate; we'll add regression tests for every stage.
- **Scalability Impact:** Same query shape; one extra predicate on `kpis.status` / workflow stage. Indexed columns already exist.
- **Rollback Strategy:** Revert the `my_review_scope` migration to the previous body (kept in version history).

## 4. 5 Why · RCA · CAPA

### 5 Why
1. Why does HR PMS see Auditor-stage KPIs?
   Because the bulk grid scope only checks "is the user the HR PMS role AND is `hr_pms_review` in the workflow", not "is the row READY for HR PMS".
2. Why is readiness not checked?
   The `my_review_scope` SQL function returns all KPIs whose resolved workflow includes the stage, regardless of `status`.
3. Why was readiness omitted?
   The function was generalized for every stage. For Manager/Auditor it used assignment tables (which implicitly gate visibility), but for HR PMS / Management it only checks role.
4. Why didn't tests catch it?
   Existing tests verify the predicate that the user is in scope at all; they don't assert that prior-stage incomplete rows are excluded for HR PMS / Management.
5. Why is this critical?
   It violates separation between Auditor approval and HR PMS final approval — HR PMS could act on KPIs the Auditor hasn't approved, breaking the workflow integrity guarantee.

### Root Cause
`public.my_review_scope` lacks a stage-readiness predicate. For `hr_pms` and `management`, it returns every KPI in the workflow regardless of whether the upstream stage(s) are complete.

### CAPA
- **Corrective:** Tighten `my_review_scope` so each stage is only returned when the KPI's `status` equals the stage immediately preceding that viewer stage in the KPI's resolved workflow (and the row is not in a `sent_back` state pending an earlier stage).
- **Preventive:** Add regression tests covering stage-readiness for every stage (manager, functional_manager, skip_level, auditor, hr_pms, management) using mock workflows.
- **Detective:** Add a one-time data audit query that reports any rows currently surfaced to HR PMS whose status is upstream of HR PMS.

## 5. Step-by-step Plan
1. Update `public.my_review_scope` to add a "stage readiness" predicate using `get_employee_workflow(...)` to compute the previous stage, and check `kpis.status` matches.
2. Keep behavior for Manager/Auditor (already gated by assignment tables) but also add the readiness gate so Manager doesn't see KPIs that haven't returned to manager state after Self submission.
3. Add a documented assumption: status = last completed stage; `pending` / null status means "ready for Self → Manager".
4. Update `BulkReviewDashboard` tooltip on "My scope only" to read: "Show only rows currently waiting on your stage."
5. Add unit tests for the predicate ordering and for each stage's readiness gate using mocked workflows.
6. Update `POLICY.md` and `DOCUMENTATION.md`.

## 6. UI Changes
- Tooltip wording change on the "My scope only" toggle in `BulkReviewDashboard`. No layout, route, or color change. Visible only on hover. Responsive: unchanged.

## 7. Implementation (technical)
- `public.my_review_scope(p_period, p_year, p_stage)` rewrite:
  - Resolve each row's workflow array `wf := get_employee_workflow(...)`.
  - Compute `prev_stage := wf[ position(stage_token) - 1 ]`. If `stage_token` is the first stage, require `kpis.status IS NULL` or `'self_submission'`.
  - Add predicate: `kpis.status = prev_stage` (i.e., last completed stage equals the immediate predecessor).
  - For `auditor` and `manager`, keep existing assignment-table check AND apply the readiness gate.
- No changes to the client-side predicate `isRowInMyReviewScope` (it only does pair matching). The narrower set already returned by the RPC will propagate to the grid.

## 8. Tests
- New: `src/test/bulkReview/myReviewScopeStageReadiness.test.ts` — mocks workflows like `['self_submission','manager_check','auditor_check','hr_pms_review']` and asserts that for stage `hr_pms_review`, only rows with status = `auditor_check` are returned.
- Extend: existing `myReviewScopePredicate.test.ts` to assert that an HR PMS user does not see rows still in `manager_check` or `self_submission`.
- Edge cases covered: missing workflow, sent-back state, workflow without HR PMS, role mismatch.

## 9. DOCUMENTATION.md updates
- Add v-entry: "Bulk Review stage-readiness fix" with the 5 Why, RCA, CAPA, and the new predicate description.

## 10. POLICY.md updates
- Under Bulk Review section: state that each reviewer stage only surfaces KPIs whose last-completed stage equals the immediate predecessor in the resolved workflow.
- Reaffirm separation: Auditor-stage KPIs are never visible to HR PMS until Auditor approval is recorded; HR PMS-stage KPIs are never visible to Auditor.

## 11. Post-implementation notes
- After approval I will: apply the SQL migration, add tests, update docs/policy, and run a one-time read-only query to count any rows previously visible to HR PMS that will now be (correctly) hidden — for transparency only.