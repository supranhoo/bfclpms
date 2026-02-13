
# Propagate Workflow Engine to ALL Remaining Components

## Problem
The workflow engine was only wired into `UnifiedScorecard` and `AuditScorecard`. Five other components still use hardcoded 6-stage pipelines, meaning employees with custom workflows (like skip-manager) see incorrect stages and buttons across Team Review, Management Review, Dashboard, and KPI detail panels.

## Gaps Found

| Component | WorkflowProgressTracker | KpiDetailsTable | KpiJourneySection |
|---|---|---|---|
| UnifiedScorecard | DONE | DONE | MISSING (via KpiReviewPanel) |
| AuditScorecard | DONE | DONE | MISSING (via KpiReviewPanel) |
| EmployeeScorecard (Team Review) | MISSING | MISSING | MISSING (via KpiReviewPanel) |
| ManagementScorecard | MISSING | MISSING | MISSING (via KpiReviewPanel) |
| Dashboard (self view) | MISSING | N/A | N/A |
| KpiTimeline modal | Hardcoded 6 stages | N/A | N/A |

## Changes

### 1. EmployeeScorecard.tsx (Team Review)
- Already imports `useEmployeeWorkflowStages` and computes `effectiveStages` -- but never passes it down
- Add `workflowStages={effectiveStages}` to `WorkflowProgressTracker` (line 504)
- Add `workflowStages={effectiveStages}` to `KpiDetailsTable` (line 627)

### 2. ManagementScorecard.tsx
- Import `useEmployeeWorkflowStages` and compute `effectiveStages`
- Add `workflowStages={effectiveStages}` to `WorkflowProgressTracker` (line 550)
- Add `workflowStages={effectiveStages}` to `KpiDetailsTable` (line 671)
- Update hardcoded send-back and forward status logic to use workflow engine

### 3. KpiReviewPanel.tsx -> KpiJourneySection
- Add optional `workflowStages` prop to `KpiReviewPanel`
- Pass it through to `KpiJourneySection`
- Update all callers (UnifiedScorecard, AuditScorecard, EmployeeScorecard, ManagementScorecard) to pass `workflowStages` when rendering `KpiReviewPanel`

### 4. Dashboard.tsx (self view)
- Import `useEmployeeWorkflowStages` with the logged-in user's ID
- Pass `workflowStages` to `WorkflowProgressTracker`

### 5. KpiTimeline.tsx
- Accept optional `workflowStages` prop
- Filter the hardcoded 6-stage array to only show stages present in the employee's workflow

### 6. DOCUMENTATION.md
- Update the workflow integration checklist with all components that must receive `workflowStages`

## Technical Details

### Files to modify:
- `src/components/review/EmployeeScorecard.tsx` -- Pass `workflowStages` to WorkflowProgressTracker and KpiDetailsTable
- `src/components/review/ManagementScorecard.tsx` -- Import workflow engine, pass `workflowStages` to tracker and table, dynamic transitions
- `src/components/review/KpiReviewPanel.tsx` -- Accept and forward `workflowStages` prop to KpiJourneySection
- `src/pages/Dashboard.tsx` -- Pass logged-in user's workflow stages to tracker
- `src/components/dashboard/KpiTimeline.tsx` -- Accept `workflowStages` prop, filter displayed stages
- `DOCUMENTATION.md` -- Update integration checklist
