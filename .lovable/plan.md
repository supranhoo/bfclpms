

## Plan — Fix Reviewer Dashboard "All Zeros" Regression (Wrong Column Location)

### Root Cause (Confirmed)

The previous fix added `manager_score, skip_level_score, hr_pms_score, audit_score, management_score` to `SLIM_KPI_SELECT` in `src/hooks/useKpis.ts`, **but those columns do not exist on the `kpis` table** — they live on `review_submissions` (and the auditor column is named `auditor_score`, not `audit_score`).

Confirmed via DB introspection:
- `kpis` table → none of these score columns exist.
- `review_submissions` → has `manager_score, skip_level_score, hr_pms_score, management_score, auditor_score, self_score, final_score`.

Result: every PostgREST request using `SLIM_KPI_SELECT` now 400s on the missing columns. Network logs show **zero successful kpis requests** — only an unrelated lightweight probe returning `[]`. With `placeholderData: keepPreviousData` masking the failure, all five stat cards collapse to 0 across HR PMS / Audit / Management / reviewer dashboards. "2,466 eligible of 2,531 active employees" still renders because the employee list comes from `profiles`, not `kpis`.

### Fix

**A. Revert the bad columns** — `src/hooks/useKpis.ts`

Remove the line `manager_score, skip_level_score, hr_pms_score, audit_score, management_score,` from `SLIM_KPI_SELECT`. The slim select returns to its prior, working column set.

**B. Source reviewer scores from the correct table** — `src/components/review/EmployeeSelectorGrid.tsx`

Reviewer-stage progress and stat cards must derive "reviewed at stage X" from `review_submissions`, not from `kpis`. Two options; we'll use the lighter-weight one:

1. Add a small companion hook `useReviewSubmissionScoresByPeriod(periodRanges)` in `src/hooks/useKpis.ts` that fetches a slim slice from `review_submissions` keyed on the same period set:  
   `id, kpi_id, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score`
2. In `EmployeeSelectorGrid`, build a `Map<kpi_id, submissionScores>` and use it inside `getEmployeeKpiStats`, `stats` memo, and `getProgressSegments` to compute `scoreReviewed` for HR PMS / Audit / Management views (`hr_pms_score IS NOT NULL`, `auditor_score IS NOT NULL`, `management_score IS NOT NULL` respectively).
3. Stat cards (`stat3` etc.) and progress bar `done/total` label use the same submissionScoreMap-backed counter.

This keeps the kpis table query lean while still giving the dashboard accurate reviewer-stage counts.

**C. Fix the `audit_score` typo everywhere it leaked**

Search the codebase for any reference to `audit_score` introduced by the previous change and rename to `auditor_score`. (The DB column is `auditor_score`.) Confirmed locations to audit: `EmployeeSelectorGrid.tsx`, `bugBountyFixes.test.ts`, the new mock test file if any.

**D. Regression test** — `src/test/bugBountyFixes.test.ts`

Replace BUG-020. New assertions:
- `SLIM_KPI_SELECT` does **not** contain any of `manager_score, skip_level_score, hr_pms_score, audit_score, auditor_score, management_score` (they belong to `review_submissions`, not `kpis`).
- A schema-shape test that documents the five reviewer score columns live on `review_submissions` and that the auditor field is named `auditor_score`.

**E. Documentation & policy**

- `DOCUMENTATION.md` v2.66.7.21 — Reviewer dashboard zeros regression fix; reviewer-stage scoring data sourced from `review_submissions`.
- `POLICY.md` §92 — Any new column added to a slim PostgREST select must be verified against `information_schema.columns` before merge. Reviewer-stage score columns belong on `review_submissions`, not `kpis`.

### Risk & Impact Report

- **Data Impact:** None (additive read-only hook on `review_submissions`, RLS already governs that table).
- **Workflow Impact:** None.
- **UI/UX:** Restores correct stat counts and progress bars on HR PMS / Audit / Management / Skip-Level / Team reviewer dashboards.
- **Regression Risk:** Low. We're reverting an invalid column list and adding a scoped companion query. Every other reviewer screen that worked before today returns to working state.
- **Mitigation:** New regression test pins the slim-select contract from the **opposite** direction (must NOT contain non-existent columns) and asserts the canonical home of the score fields.

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useKpis.ts` | Remove non-existent score columns from `SLIM_KPI_SELECT`; add `useReviewSubmissionScoresByPeriodRanges` hook |
| `src/components/review/EmployeeSelectorGrid.tsx` | Wire submissionScoreMap into stat cards and `getProgressSegments`; fix `audit_score` → `auditor_score` |
| `src/test/bugBountyFixes.test.ts` | Rewrite BUG-020 to pin slim-select contract and document column ownership |
| `DOCUMENTATION.md` | v2.66.7.21 changelog |
| `POLICY.md` | §92 — verify columns against `information_schema.columns` before adding to slim selects |

### Out of Scope

- The `Warning: Function components cannot be given refs` console warning in `PaginationEllipsis` is cosmetic and unrelated to this regression.
- No RLS, workflow engine, or scoring engine changes.

