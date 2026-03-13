

# Plan: Workflow Reconciliation — "Reconcile Orphaned KPIs" Button

## Problem

When a workflow changes mid-cycle (e.g., from 8-stage to 5-stage), KPIs that have already passed all stages in the new shorter workflow remain stuck at an orphaned status (e.g., `audit` or `management_review`) instead of being marked `approved`. The system has no mechanism to detect and fix this.

**Example**: Employee had 8-stage workflow. Their KPI reached `hr_pms_review`. The workflow is changed to 5-stage (ending at `manager_check` → `audit` → `management_review` → `approved`). The KPI is at `hr_pms_review` which no longer exists in the new workflow — it should be `approved` since it has passed beyond the stages that matter.

## Solution

### 1. Database Function — `reconcile_workflow_statuses`

Create a `SECURITY DEFINER` RPC that:

1. For each non-approved KPI, resolves the employee's current workflow (period-aware via `get_employee_workflow`).
2. Checks if the KPI's current `status` is **not present** in the resolved workflow stages (orphaned) **OR** if the KPI's status is at or beyond the last non-`approved` stage.
3. For orphaned KPIs that have progressed past the new workflow's terminal review stage:
   - Sets `kpis.status = 'approved'`
   - Sets `review_submissions.final_rating` and `final_score` from the latest available rating/score (manager → auditor → self, whichever was last filled)
   - Logs the action to `kpi_audit_logs` with action `'WORKFLOW_RECONCILED'`
4. Returns a summary: count of reconciled KPIs, list of affected employee names, and their old/new statuses.

**Parameters**: Optional `p_review_period TEXT`, `p_review_year INT` to scope reconciliation to a specific period (or all if NULL). Optional `p_dry_run BOOLEAN DEFAULT true` for preview mode.

### 2. Frontend — "Reconcile Orphaned KPIs" Button on WorkflowConfig page

Add a button in the Workflow Configuration page (near the period selector area) labeled **"Reconcile Orphaned KPIs"**. Clicking it:

1. First runs in **dry-run mode** — calls the RPC with `p_dry_run = true`
2. Shows a confirmation dialog listing:
   - Number of KPIs that would be affected
   - Table of affected employees, KPI names, current status → new status (`approved`)
   - The review period scope being reconciled
3. On confirm, runs the RPC with `p_dry_run = false`
4. Shows a toast with the count of reconciled KPIs
5. Invalidates relevant query caches

### 3. Reconciliation Logic (inside the RPC)

```text
FOR each KPI WHERE status != 'approved':
  1. Resolve employee's workflow stages via get_employee_workflow(employee_id, period, year)
  2. IF kpi.status NOT IN workflow_stages:
     → KPI is orphaned. Check if it has passed the last review stage:
       - Find the index of kpi.status in the OLD implicit order
       - Compare against the last non-'approved' stage in the new workflow
       - If the orphaned status is "beyond" the new workflow's terminal stage → mark approved
  3. IF kpi.status IS IN workflow_stages AND status is the last stage before 'approved':
     → Already at terminal stage, no action needed (normal flow handles this)
  
  For approved KPIs:
    - Copy best available score to final_score/final_rating
    - Update kpis.status to 'approved'
    - Insert audit log entry
```

The "beyond" check uses a canonical ordering of all possible stages:
`kra_set < self_review < manager_check < skip_level_check < hr_pms_review < audit < management_review`

If a KPI's status has a higher canonical index than the new workflow's terminal review stage, it qualifies for auto-approval.

## Files Modified

1. **New SQL migration** — `reconcile_workflow_statuses` RPC function
2. **`src/pages/admin/WorkflowConfig.tsx`** — Add reconciliation button, dry-run preview dialog, and execute action
3. **`src/hooks/useWorkflowConfig.ts`** — Add `useReconcileWorkflowStatuses` mutation hook

## Safety

- Dry-run by default — admin must explicitly confirm after reviewing affected KPIs
- Audit logged — every reconciled KPI gets a `kpi_audit_logs` entry with old status, new status, and reason
- Period-scoped — can target a specific month/year or run globally
- No data loss — only advances status forward to `approved`, never moves backward

