

# Enhance KPI Tracker Modal: Dynamic Workflow Columns + Fix Remarks

## Two Issues

1. **Hardcoded score columns** — Currently shows all 6 score levels (Self, Manager, Skip, HR, Auditor, Mgmt) regardless of the employee's actual workflow. Should only show columns mapped to the employee's workflow stages, using the same `STAGE_COLUMN_MAP` / `buildScoreColumns` pattern from `KpiDetailsTable.tsx`. If different months have different workflows, the union of all stages is shown.

2. **Remarks not displaying** — The collapsible remarks rows exist in code but may not be triggering because `getLast2Remarks` relies on submission data being present. Need to verify the remarks fields are populated in the `submissions` prop and ensure the expand/collapse UI is working.

## Technical Changes

### 1. Pass `workflowStages` into `KpiTrackerModal`

**All 5 callers** (UnifiedScorecard, EmployeeScorecard, AuditScorecard, ManagementScorecard, SelfReviewSheet) already have `workflowStages` or `effectiveStages` available. Add a new prop:

```ts
interface KpiTrackerModalProps {
  // ...existing
  workflowStages?: string[];
}
```

Each caller passes their `effectiveStages` (or equivalent) to the modal.

### 2. Dynamic columns in `KpiTrackerModal`

- Reuse the `STAGE_COLUMN_MAP` pattern from `KpiDetailsTable.tsx`
- Compute the union of workflow stages across all months' KPIs (to handle cases where Jan has a 3-stage workflow and Feb has a 5-stage workflow)
- Build table headers and cells dynamically from the resolved columns
- Always append "Final" column at the end

### 3. Fix remarks display

- Verify that the `remarks` array in `MonthEntry` is being populated correctly from submission data
- Ensure the chevron expand/collapse and the remarks sub-row render properly (the current code looks correct structurally — the issue is likely that `submissions` passed to the modal don't contain remarks fields, or the KPI matching isn't finding submissions)
- Add fallback: also check if the related KPI's submission has remarks even when the primary match misses

### Files to modify:
- `src/components/dashboard/KpiTrackerModal.tsx` — dynamic columns + remarks fix
- `src/components/review/UnifiedScorecard.tsx` — pass `workflowStages`
- `src/components/review/EmployeeScorecard.tsx` — pass `workflowStages`
- `src/components/review/AuditScorecard.tsx` — pass `workflowStages`
- `src/components/review/ManagementScorecard.tsx` — pass `workflowStages`
- `src/components/review/SelfReviewSheet.tsx` — pass `workflowStages`

