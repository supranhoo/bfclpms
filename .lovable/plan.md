
## Plan — Fix "HR PMS Reviewed = 0" (and Audit/Management equivalents) on Reviewer Dashboard

### Root Cause (Confirmed via DB + Code Audit)

For March 2026, the database has **504 KPIs with `hr_pms_score`** belonging to **48 employees**, yet the dashboard shows **HR PMS Reviewed = 0** while **Total Employees = 42**.

Two compounding bugs in `EmployeeSelectorGrid.tsx` + `useOrganization.ts`:

**Bug A — Roster excludes already-reviewed employees (primary cause).**
The HR PMS / Audit / Management roster is built by `useProfilesByWorkflowStage('hr_pms_review', ...)`. Its "stage-presence seed" only seeds employees with KPIs **currently** at `status='hr_pms_review'`. Once HR PMS reviews a KPI and it advances to `audit` / `management_review` / `approved`, that employee is no longer seeded. They only stay in the roster if the resilient workflow-resolver branch (`stagesMap.get(p.id)?.includes('hr_pms_review')`) catches them — which it does inconsistently for older periods, employees with template overrides, or RPC chunk failures.
Result: KPIs counted in the "Reviewed" stat live on employees who have been silently filtered OUT of `demographicFilteredMembers`, so `relevantKpis` (intersected with `memberIds`) drops them and the count collapses to 0.

**Bug B — Fragile React Query cache key.**
`useReviewSubmissionScoresByKpiIds` uses `stableKey = ${kpiIds.length}:${kpiIds[0]}`. Two different periods with the same KPI count and the same first id will share a stale cache. Not the cause of today's 0, but a latent regression vector that worsens once Bug A is fixed.

Same logic powers Audit (`auditor_score`) and Management (`management_score`) reviewed counts — both currently under-report for the same reason.

### The Fix

**1. Seed roster from review_submissions score-signature (definitive fix for Bug A).**
In `useProfilesByWorkflowStage`, extend the stage-presence seed to also include employees whose `review_submissions` row for the period carries the **completed-stage score signature**:
- `hr_pms_review` stage → seed employees whose period KPIs have `hr_pms_score IS NOT NULL`
- `audit` stage → seed employees with `auditor_score IS NOT NULL`
- `management_review` stage → seed employees with `management_score IS NOT NULL`

This guarantees: *if a reviewer has ever scored a KPI for this period, that employee is in the roster*, regardless of where the KPI has since moved.

Implementation: one extra paged query against `review_submissions JOIN kpis` filtered by `review_period`, `review_year`, and the relevant score column being non-null. Wrapped in try/catch with the same diagnostic breadcrumb pattern already in the hook.

**2. Stabilise the submission-score cache key (fix Bug B).**
In `useReviewSubmissionScoresByKpiIds`, replace `${kpiIds.length}:${kpiIds[0]}` with a deterministic hash of the sorted id list (e.g., FNV-1a or simple sum-of-charcodes accumulator over sorted ids, truncated). Keeps the key short while eliminating false cache hits.

**3. Diagnostic breadcrumb update.**
Extend the `[useProfilesByWorkflowStage]` `console.info` to log `seededFromScoreSignature` so future regressions of this class are immediately visible.

**4. Regression coverage.**
Add `BUG-022` in `src/test/bugBountyFixes.test.ts` asserting:
- The seed source code includes a `review_submissions` lookup keyed off the stage-to-score-column map.
- The cache key is no longer the `length:firstId` form (string match against the new helper name).

### Risk & Impact Report
- **Data impact:** None — read-only seed expansion. No writes, no schema change.
- **Workflow impact:** None — does not change who CAN review, only who is COUNTED as already reviewed.
- **UI/UX:** "HR PMS Reviewed", "Auditor Reviewed", "Management Reviewed" stat cards become accurate. `Total Employees` may rise slightly (+5–10 in the March example) as historically-scored employees re-enter the visible roster — this is the correct behaviour and matches the existing tooltip ("KPIs with an HR PMS score recorded for this period, regardless of current stage").
- **Performance:** One additional paged `review_submissions` query per reviewer-stage roster load (~500 rows for a typical period). Cached by React Query under existing `profiles-by-workflow-stage` key. Negligible.
- **Regression risk:** Low. The expansion is additive (union of seed sets); no employee currently in the roster will be removed.
- **Mitigation:** Diagnostic breadcrumb + new BUG-022 test + the existing manual Refresh button (v2.66.7.23) lets users re-validate after the fix ships.

### Files to Change
| File | Change |
|---|---|
| `src/hooks/useOrganization.ts` | Add score-signature seed branch in `useProfilesByWorkflowStage` for `hr_pms_review` / `audit` / `management_review` stages; extend diagnostic breadcrumb |
| `src/hooks/useKpis.ts` | Replace fragile `length:firstId` cache key in `useReviewSubmissionScoresByKpiIds` with a deterministic hash of sorted ids |
| `src/test/bugBountyFixes.test.ts` | Add `BUG-022` covering both fixes |
| `DOCUMENTATION.md` | v2.66.7.24 changelog entry |
| `POLICY.md` | §95 — reviewer rosters MUST include employees with completed-stage score signatures, not only those currently AT the stage |

### Out of Scope
- No change to the workflow engine, RPC `get_bulk_employee_workflows`, or scoring engine.
- No change to the `manager_check` / `skip_level_check` rosters (they use `_score` columns on `review_submissions` correctly via a different code path; verified during investigation).
- The unrelated `AuditAssignmentDialog` ref warning visible in console is cosmetic and untouched.
