## Goal
Make the **Daily Submission Summary** table in the review sheet workflow-aware so reviewer columns (Manager / Skip-Lvl / HR PMS / Auditor / Mgmt) appear **only if that stage exists in the employee's resolved workflow template** AND the KPI has progressed to/past that stage. Today it shows all 6 columns regardless of template (e.g. a `self_l1_audit` employee currently sees Skip-Lvl, HR PMS, Mgmt as `—` once status advances).

## Risk & Impact
- **UI only.** No DB, RLS, RPC, or scoring changes.
- **Regression risk:** low — column gating becomes stricter (subset of today's columns). Existing data still renders correctly under the same stage-reached rule.
- **Affected callers:** `UnifiedScorecard`, `EmployeeScorecard`, `AuditScorecard`, `ManagementScorecard`, `SelfReviewSheet`, `InlineDailySubmissionRow`. All except `InlineDailySubmissionRow` already resolve `effectiveStages` via `useEmployeeWorkflowStages`; that one will need to resolve it from props (employeeId + period + year).
- **Pagination/perf:** unaffected.
- **Mitigation:** prop is optional with safe fallback to current STATUS_ORDER behavior so any caller missing the prop keeps working.

## Plan

### 1. `src/components/review/DailySubmissionSummary.tsx`
- Add optional prop `workflowStages?: string[]` (the resolved template stages, e.g. `['kra_set','self_review','manager_check','audit','approved']`).
- In `visibleColumns` useMemo:
  - Keep current "status has reached stage" gate.
  - Add second gate: only push a reviewer column when the corresponding workflow stage is present in `workflowStages` (when provided). Mapping:
    - Manager → `manager_check`
    - Skip-Lvl → `skip_level_check`
    - HR PMS → `hr_pms_review`
    - Auditor → `audit`
    - Mgmt → `management_review`
  - When `workflowStages` is undefined, fall back to today's behavior (back-compat).
- Header chip "N review levels" already derives from `visibleColumns.length` — will automatically reflect the trimmed set (e.g. "3 review levels" for `self_l1_audit`).

### 2. Wire `workflowStages` through callers
Pass the already-resolved `effectiveStages` (or equivalent) into `<DailySubmissionSummary>`:
- `UnifiedScorecard.tsx` → `DailySubmissionSummaryWithOverride` → `DailySubmissionSummary` (thread prop through).
- `EmployeeScorecard.tsx` → same pattern (already has `effectiveStages` from `useEmployeeWorkflowStages`).
- `AuditScorecard.tsx`, `ManagementScorecard.tsx`, `SelfReviewSheet.tsx` → use existing `useEmployeeWorkflowStages(employee.id, period, year)`.
- `InlineDailySubmissionRow.tsx` → add the same hook call (employeeId/period/year already available on the row) and pass through.

### 3. Tests
- New `src/test/dailySubmissionSummaryWorkflowAware.test.tsx`:
  - `self_l1_audit` template + status=`approved` → renders Self + Manager + Auditor columns only (no Skip-Lvl / HR PMS / Mgmt).
  - `self_hr_pms` template + status=`hr_pms_review` → Self + Manager + HR PMS.
  - Full template + status=`approved` → all 6 columns (regression).
  - `workflowStages` omitted → behaves like today (back-compat).

### 4. Docs / Policy / Memory
- `DOCUMENTATION.md`: log **v2.66.69 — Daily Submission Summary is workflow-template aware**.
- `POLICY.md`: extend §dynamic-workflow-columns (or add §DAILY-SUBMISSION-WORKFLOW-AWARENESS) to mandate that any per-day/sub-period grid must gate reviewer columns on the resolved workflow template + status-reached, never on the maximal 6-stage chain.
- `docs/adr/ADR-100.md`: short ADR — root cause (linear STATUS_ORDER ignored template), fix, and the rule that all reviewer grids must consume `useEmployeeWorkflowStages`.
- `mem/features/review/dynamic-workflow-columns.md`: append a "Daily Submission Summary" section noting the same contract applies and reference the new test.

### Rollback
Single-file revert of `DailySubmissionSummary.tsx` restores the old behavior; caller prop is optional.

## Out of scope
- Score calculation, RLS, scoring fallback chain (untouched).
- Non-daily/sub-period scorecards.