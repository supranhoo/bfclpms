## Goal
Add a **Final Approver** column to the KPI Scorecard Detail report showing which workflow role is the last approving stage in each employee's resolved workflow for the selected period (e.g., Management, Auditor, HR PMS, Skip-Level, L1 Manager).

## Interpretation
"Final approver" = the last non-self stage in the employee's period-resolved workflow template (as returned by `get_employee_workflow_info`). Displayed as the role label from `CHAIN_STAGE_LABEL` (e.g., "Management", "Auditor", "HR PMS", "Skip-Level", "L1 Manager"). If the employee has no resolvable workflow, show `—`.

If the user wants the person's full name instead of the role label, this can be a follow-up; role label matches the existing column vocabulary of the report (Self / Mgr / Skip / HR / Audit / Mgmt).

## Where
`src/pages/reports/KpiScorecardDetail.tsx` only.

## Data source
Reuse the existing `useWorkflowResolution(period, year)` hook (already used elsewhere; batches `get_employee_workflow_info`). Build `Map<employeeId, finalApproverLabel>` where `finalApproverLabel` is derived from the last entry of `chain.templateStages` mapped through the internal `STAGE_TO_CHAIN` → `CHAIN_STAGE_LABEL`.

Because the hook is per-period, it is called with `appliedQuery.month / appliedQuery.year` and gated by `enabled: !!appliedQuery`. Result is cached (staleTime 2 min) so switching filters is cheap.

No DB / RPC / schema changes.

## Changes in `KpiScorecardDetail.tsx`
1. Add field descriptor in `KSD_DEFAULT_FIELDS`:
   `{ field_key: 'final_approver', default_label: 'Final Approver', default_sort: 285 }` — inserted between `final_score` (280) and `status` (290) so the on-screen and exported column order both read `... Final → Final Approver → Status`.
2. Extend `FlatRow` with `finalApprover: string`.
3. Thread an `employeeApproverMap: Map<string,string>` param into `fetchScorecardForPeriod` OR (preferred, less invasive) resolve it in the component after fetching using the workflow-resolution hook and merge into the rows via `useMemo`. Chosen approach: compute in a `useMemo` that maps `rows` → `rowsWithApprover` using the resolution map; downstream `filtered` / `paged` / export functions operate on this augmented list.
4. Add table column between `Final` and `Status` with sort + tooltip.
5. Extend `ksdValueFor` with a `final_approver` case for exports (single-month + range).
6. For range export: `handleRangeExport` calls `fetchScorecardForPeriod` per period without the hook. Fix by calling a small local helper `fetchFinalApproverMap(period, year)` that runs the same profile+RPC batching pattern as `useWorkflowResolution` (extract a shared helper `resolveFinalApproverMap` into `src/lib/finalApproverMap.ts` so both surfaces share one implementation).
7. Update `colSpan={14}` on the "no rows" empty-state row to `15`.

## New helper file
`src/lib/finalApproverMap.ts`
- Exports `getFinalApproverLabel(templateStages: string[]): string`
- Exports `async fetchFinalApproverMap(period, year): Promise<Map<string,string>>` reusing the same RPC pattern; refactor `useWorkflowResolution` to consume the same helper so behavior stays in lock-step (SSOT).

## Test
Add `src/test/finalApproverMap.test.ts`:
- Empty stages → `'—'`
- `['self_review','manager_check']` → `'L1 Manager'`
- `['self_review','manager_check','skip_level_check','hr_pms_review','management_review']` → `'Management'`
- Unknown stage suffix → falls back to `'—'`

## Risk & Impact
- Data: read-only, no schema change.
- Workflow: none.
- UI: one extra column; header/rows/export all updated together, `colSpan` bumped.
- Perf: one extra RPC batch per period (~25/emp batched, cached 2min). Range export runs it per period sequentially — same pattern as the existing per-period fetch, negligible extra latency.
- Regression: none — additive field with default sort slotted between existing columns; report field registry consumers pick it up via `useResolvedReportFields` and admins can hide it.

## Rollback
Revert `KpiScorecardDetail.tsx`, delete `src/lib/finalApproverMap.ts` and its test.
