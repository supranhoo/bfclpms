

# Fix Inaccurate Bottleneck Report Data (v1.45.91)

## Root Cause

The bottleneck report has a fundamental **off-by-one error** in how it maps KPI statuses to labels and responsible persons. In the PMS workflow engine:

- `kra_set` means the employee has NOT yet submitted self-review -- employee is responsible
- `self_review` means the employee HAS submitted -- the **Manager** is now responsible
- `manager_check` means the Manager HAS reviewed -- the **next reviewer** is responsible
- `skip_level_check` means Skip-Level HAS reviewed -- the **next reviewer** is responsible
- `hr_pms_review` means HR PMS HAS reviewed -- the **next reviewer** is responsible
- `audit` means it's at auditor stage -- **Auditor** is responsible
- `management_review` means it's at management stage -- **Management** is responsible

But the current code labels `self_review` as "Awaiting Self Review" (wrong -- self review is done), `manager_check` as "Awaiting Manager Review" (wrong -- manager is done), etc. This cascading error makes all stage counts and responsible-person assignments inaccurate.

Additionally, who is responsible for a KPI at `manager_check` depends on the **employee's workflow template** (could be Skip-Level, HR PMS, or Auditor depending on which stages are in that employee's pipeline). The current code ignores workflow templates entirely.

## Solution

Make the bottleneck report **workflow-aware** by:

1. Fetching each employee's workflow stages via the existing `get_bulk_employee_workflows` RPC
2. For each pending KPI, resolving the **actual responsible reviewer** based on the KPI's status and the employee's specific workflow pipeline
3. Grouping and labeling by "who needs to act" rather than by raw status value

## Correct Stage-to-Responsibility Mapping

For the **8-stage pipeline** `[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, audit, management_review, approved]`:

| KPI Status | Actually Responsible | Correct Label |
|---|---|---|
| `kra_set` | Employee | Awaiting Self Review |
| `self_review` | Manager | Awaiting Manager Review |
| `manager_check` | Skip-Level Manager | Awaiting Skip-Level Review |
| `skip_level_check` | HR PMS | Awaiting HR PMS Review |
| `hr_pms_review` | Auditor | Awaiting Audit |
| `audit` | Auditor | Awaiting Audit |
| `management_review` | Management | Awaiting Management Review |

For the **6-stage pipeline** `[kra_set, self_review, manager_check, audit, management_review, approved]`:

| KPI Status | Actually Responsible | Correct Label |
|---|---|---|
| `kra_set` | Employee | Awaiting Self Review |
| `self_review` | Manager | Awaiting Manager Review |
| `manager_check` | Auditor | Awaiting Audit |
| `audit` | Auditor | Awaiting Audit |
| `management_review` | Management | Awaiting Management Review |

## Technical Changes

### 1. `src/hooks/useBottleneckReport.ts` -- Major refactor

**Add workflow resolution:**
- Collect unique employee IDs from pending KPIs
- Call `useBulkEmployeeWorkflows` (already exists in `useWorkflowConfig.ts`) to get each employee's workflow stages
- Add a new resolver function `resolveBottleneckStage(kpiStatus, workflowStages)` that returns: `{ stageKey, stageLabel, responsibleRole }`

**Resolver logic:**
```text
Given a KPI at status X and employee workflow stages[]:
1. Find the index of X in stages
2. The NEXT stage after X tells us who is waiting:
   - next = 'self_review' -> Employee pending
   - next = 'manager_check' -> Manager pending
   - next = 'skip_level_check' -> Skip-Level pending
   - next = 'hr_pms_review' -> HR PMS pending
   - next = 'audit' -> Auditor pending
   - next = 'management_review' -> Management pending
   - next = 'approved' -> should not be pending (edge case)
3. Special: kra_set has no "previous" -- employee is responsible
```

**Update `getResponsiblePerson`:** Use the resolved stage to determine the actual person:
- kra_set / self_review stages -> Employee name
- Manager stage -> Reporting manager name
- Skip-Level -> Skip-level manager name (from profiles)
- HR PMS / Audit / Management -> Role labels

**Update summary stats:** Group by the resolved "responsible stage" (not raw status), so the summary cards show accurate counts.

### 2. `src/pages/reports/BottleneckReport.tsx`

- Update summary card labels to match the corrected terminology
- No structural UI changes needed -- the cards already exist for all stages

### 3. `DOCUMENTATION.md`

- Bump version to v1.45.91
- Document the workflow-aware bottleneck resolution logic

## Risk Assessment

| Aspect | Risk | Mitigation |
|---|---|---|
| Data impact | None -- read-only queries | No schema changes |
| Regression risk | Medium -- changes all bottleneck counts | Counts will now be accurate; verified against workflow engine logic |
| Performance | Low -- one additional RPC call for bulk workflows | RPC already exists and is cached with 5-minute staleTime |
| Workflow edge cases | Some employees may not have workflow config | Falls back to DEFAULT_WORKFLOW_STAGES (6-stage pipeline) |

