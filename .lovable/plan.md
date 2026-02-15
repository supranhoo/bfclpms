
# Fix: KPI Details Table Not Showing Workflow-Mapped Columns

## Problem

The KPI Details table in the scorecard view always shows the same 5 hardcoded score columns (Self, Manager, Auditor, Mgmt, Final) regardless of the employee's actual workflow stages. From the screenshot:

- The employee's workflow is: KRA SET -> SELF REVIEW -> MANAGER CHECK -> SKIP-LEVEL -> HR PMS -> APPROVED
- But the table shows **Auditor** and **Mgmt** columns (which are not in this workflow) with dashes
- The table is **missing Skip-Level and HR PMS** score columns (which ARE in this workflow)

This means reviewers see irrelevant columns and cannot see the scores from stages that actually exist in the employee's pipeline.

## Root Cause (3 Issues)

| Issue | File | Detail |
|---|---|---|
| 1. Hardcoded columns | `KpiDetailsTable.tsx` line 24-30 | `SCORE_COLUMNS` is a static array of 5 columns, never filtered by workflow |
| 2. Missing TS fields | `useKpis.ts` line 65-93 | `ReviewSubmission` interface lacks `skip_level_score`, `skip_level_rating`, `hr_pms_score`, `hr_pms_rating` |
| 3. Missing score resolver | `KpiDetailsTable.tsx` line 66-87 | `getScoreForColumn()` has no cases for skip-level or HR PMS scores |

## Solution

### 1. Update `ReviewSubmission` interface (useKpis.ts)

Add the missing fields that already exist in the database:
- `skip_level_score`, `skip_level_rating`, `skip_level_remarks`, `skip_level_evidence_url`
- `hr_pms_score`, `hr_pms_rating`, `hr_pms_remarks`, `hr_pms_evidence_url`

### 2. Make score columns dynamic in KpiDetailsTable.tsx

Replace the hardcoded `SCORE_COLUMNS` with a function that builds columns based on `workflowStages`:

```text
Workflow Stage          ->  Score Column
self_review             ->  Self (self_score)
manager_check           ->  Manager (manager_score)
skip_level_check        ->  Skip-Level (skip_level_score)
hr_pms_review           ->  HR PMS (hr_pms_score)
audit                   ->  Auditor (auditor_score)
management_review       ->  Mgmt (management_score)
(always last)           ->  Final (final_score)
```

Only columns whose stage exists in `workflowStages` will render, plus Final is always shown.

### 3. Update `getScoreForColumn` function

Add switch cases for `skip_level_score` and `hr_pms_score`.

### 4. Fix `totalColumns` calculation

Change from hardcoded `12` to dynamic based on the number of visible score columns.

### 5. Update the `review_submissions` select query

Ensure the `useReviewSubmissions` hook fetches the skip-level and HR PMS fields from the database.

### 6. Update DOCUMENTATION.md

Document the dynamic column behavior.

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useKpis.ts` | Add skip_level and hr_pms fields to `ReviewSubmission` interface |
| `src/components/review/KpiDetailsTable.tsx` | Dynamic columns based on workflow, add score resolvers, fix colSpan |
| `DOCUMENTATION.md` | Note dynamic column mapping |

## Expected Result

For the employee in the screenshot (workflow: Self -> Manager -> Skip-Level -> HR PMS -> Approved):
- Columns shown: **Category, KRA/KPI, Target, Weightage, Self, Manager, Skip-Level, HR PMS, Final, Status, Actions**
- Columns NOT shown: Auditor, Mgmt (not in this workflow)

For the default 6-stage workflow (Self -> Manager -> Audit -> Management -> Approved):
- Columns shown: **Category, KRA/KPI, Target, Weightage, Self, Manager, Auditor, Mgmt, Final, Status, Actions** (same as current behavior)

## Risk Assessment

- Low risk -- only changes column visibility logic in one table component
- Backward compatible -- default workflow produces identical output to current behavior
- No database changes required -- fields already exist, just not read by the frontend
