

## RCA: KPI Not Following Correct Mapped Workflow

### Root Cause

This is NOT a code bug — it's a **timing/sequence issue**:

1. When the manager reviewed this KPI, the employee's workflow at that time included stages beyond `manager_check` (e.g., audit, management_review)
2. The `resolveForwardStatus('manager', stages)` correctly returned `'manager_check'` (standard behavior — KPI sits at manager_check waiting for the next reviewer)
3. **After** the manager approved, the admin changed the employee's workflow template to a shorter pipeline (e.g., `kra_set → self_review → manager_check → approved`)
4. Now `manager_check` is the terminal stage, but the KPI was already set to that status. No downstream reviewer exists to advance it further

The forward logic in both `EmployeeScorecard.tsx` and `UnifiedScorecard.tsx` is correct — they use `resolveForwardStatus('manager', effectiveStages)` at the time of approval. The problem is that workflow changes are not retroactively applied to KPIs already in-flight.

### This Is What The Reconciliation Tool Fixes

The `reconcile_workflow_statuses` RPC (just updated in the last two migrations) handles exactly this case as **"terminal_stage_completed"**:
- KPI at `manager_check` (terminal stage in current workflow)
- Manager score exists → auto-advance to `approved`

**The fix is already deployed.** The admin just needs to run the reconciliation tool from `/admin/workflow-config` for January 2026. The dry run will show these KPIs as "Terminal Stage — Completed" and executing will move them to `approved`.

### Optional Preventive Enhancement

To prevent this from happening in the future, we could add an **automatic reconciliation trigger** that runs whenever a workflow template assignment changes. This would immediately fix any in-flight KPIs affected by the template change.

#### Implementation

**`supabase/functions/auto-reconcile-workflow/index.ts`** — New edge function:
- Called after workflow template assignment changes (from WorkflowConfig page)
- Runs `reconcile_workflow_statuses` with `dry_run = false` for the affected employee + period
- Returns count of reconciled KPIs
- Shows a toast to the admin: "3 KPIs auto-reconciled due to workflow change"

**`src/hooks/useWorkflowConfig.ts`** — After saving workflow overrides:
- Call the auto-reconcile function
- Show reconciliation results in a toast notification

**`src/pages/admin/WorkflowConfig.tsx`** — Add info banner:
- "Changing workflow templates will automatically reconcile any in-flight KPIs for affected employees"

### Files
- `supabase/functions/auto-reconcile-workflow/index.ts` — new edge function
- `src/hooks/useWorkflowConfig.ts` — trigger auto-reconcile after template changes
- `src/pages/admin/WorkflowConfig.tsx` — info banner about auto-reconciliation

### No database changes needed
The `reconcile_workflow_statuses` RPC already handles this correctly after the recent fixes.

