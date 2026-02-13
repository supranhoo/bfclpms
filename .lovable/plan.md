
# RCA and CAPA: Workflow Configuration Not Being Applied

## Root Cause Analysis (RCA)

The **workflow configuration system is entirely disconnected from actual status transitions**. While the admin UI allows assigning workflow templates (e.g., "Full 5-Stage Review" which skips Manager Check for Jaspal), every status transition in the application is **hardcoded** to the full 6-stage pipeline.

### Evidence

- **Jaspal's config**: Assigned template "Full 5-Stage Review" (`skip_manager`) with stages: `kra_set -> self_review -> audit -> management_review -> approved` (no `manager_check`)
- **Actual behavior**: When Jaspal's KPIs move from `self_review`, they go to `manager_check` -- a stage that shouldn't exist in her workflow
- **The helper functions `getNextWorkflowStatus()` and `useEmployeeWorkflowStages()` are defined but NEVER imported or called** anywhere in the transition logic

### Where Hardcoding Exists (7 Affected Areas)

| Location | Problem |
|---|---|
| `UnifiedScorecard.tsx` (VIEW_LEVEL_CONFIG) | Manager always forwards to `manager_check`, Auditor always expects `manager_check` as input |
| `EmployeeScorecard.tsx` (approve handler) | Hardcodes `status: 'manager_check'` on manager approval |
| `useKpis.ts` (submit/approve mutations) | Hardcodes `self_review` and `manager_check` transitions |
| `WorkflowProgressTracker.tsx` | Always renders all 6 stages regardless of employee's template |
| `KpiJourneySection.tsx` | Always shows all 4 reviewer stages (Self/Manager/Auditor/Management) |
| `EmployeeSelectorGrid.tsx` | Hardcodes status filters (`self_review`, `manager_check`, etc.) |
| `KpiDetailsTable.tsx` | Hardcodes which statuses are editable per view level |

---

## Corrective and Preventive Action (CAPA)

### Phase 1: Core Workflow Engine (Critical)

**1.1 Create a workflow resolution utility** (`src/lib/workflowEngine.ts`)
- A pure function `resolveNextStatus(currentStatus, employeeWorkflowStages)` that returns the correct next status by looking up the employee's assigned stages
- A function `resolveSendBackTargets(currentStatus, employeeWorkflowStages)` that returns only valid send-back options based on which stages exist in the workflow
- A function `getVisibleStages(employeeWorkflowStages)` that returns only the stages to display in UI

**1.2 Update UnifiedScorecard.tsx**
- Fetch the employee's workflow stages using `useEmployeeWorkflowStages(employee.id)`
- Replace hardcoded `forwardStatus` with dynamic resolution: call `resolveNextStatus(currentStatus, stages)` before each transition
- Dynamically compute `pendingStatus` and `reviewableStatuses` from the workflow stages
- Filter `sendBackTargets` to only show stages that exist in the employee's workflow

**1.3 Update EmployeeScorecard.tsx**
- Same pattern: fetch workflow stages, replace hardcoded `'manager_check'` with `resolveNextStatus('self_review', stages)`

**1.4 Update useKpis.ts (submit mutations)**
- The `useSubmitSelfReview` mutation hardcodes `status: 'self_review'` -- this is correct (self_review is always the post-submission status)
- The manager approval mutation hardcodes `'manager_check'` -- this needs to use the workflow engine
- Add an optional `workflowStages` parameter to the manager approval mutation, or resolve it inside the mutation

### Phase 2: UI Display (Important)

**2.1 Update WorkflowProgressTracker.tsx**
- Accept an optional `workflowStages` prop
- When provided, filter `stageConfig` to only show stages present in the workflow
- On the Dashboard (self view), use the logged-in employee's workflow
- On reviewer views, use the selected employee's workflow

**2.2 Update KpiJourneySection.tsx**
- Accept a `workflowStages` prop
- Filter `getVisibleStages()` to only return stages that exist in the employee's workflow
- Update `getStageStatus()` to work correctly with variable-length pipelines

**2.3 Update EmployeeSelectorGrid.tsx**
- The stat cards (Pending Review, Pending Audit, etc.) should account for workflows where certain stages don't exist
- KPIs for employees on `skip_manager` workflow should not appear in "Pending Audit" as `manager_check` -- they should appear as `self_review` going directly to audit

### Phase 3: Edge Cases and Validation

**3.1 Send-back logic**
- When an auditor sends back a KPI, the send-back targets should only include stages that exist in the employee's workflow
- For `skip_manager` workflow: Auditor should only see "Send back to Employee" (no Manager option)

**3.2 Self-review submission**
- After employee submits self-review, the status should advance to the **next stage in their workflow**, not always `self_review`
- For `skip_manager`: after self-review submission, status should indicate readiness for Audit (the KPI stays at `self_review` status which is correct -- the auditor's `pendingStatus` needs to include `self_review` when manager_check is skipped)

**3.3 RLS policy alignment**
- Verify that the database RLS policies allow auditors to update KPIs at `self_review` status (not just `manager_check`) when the workflow skips manager

### Phase 4: Documentation

**4.1 Update DOCUMENTATION.md**
- Document the workflow engine utility and how dynamic workflow resolution works
- Document which hooks to use when transitioning KPI statuses

---

## Technical Details

### Files to Create
- `src/lib/workflowEngine.ts` -- Pure utility functions for workflow resolution

### Files to Modify
- `src/components/review/UnifiedScorecard.tsx` -- Dynamic status transitions based on employee workflow
- `src/components/review/EmployeeScorecard.tsx` -- Dynamic status transitions
- `src/hooks/useKpis.ts` -- Workflow-aware mutations
- `src/components/review/WorkflowProgressTracker.tsx` -- Filter displayed stages
- `src/components/review/KpiJourneySection.tsx` -- Filter displayed stages
- `src/components/review/EmployeeSelectorGrid.tsx` -- Workflow-aware stat filtering
- `src/components/review/KpiDetailsTable.tsx` -- Workflow-aware editability
- `DOCUMENTATION.md` -- Updated docs

### Key Design Decision
The workflow stages array from the database becomes the **single source of truth** for all transition logic. Every component that transitions or displays statuses must consult the employee's workflow stages rather than relying on a hardcoded 6-stage pipeline.
