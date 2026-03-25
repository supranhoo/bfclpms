

## Fix Reconciliation Branch 2b to Respect "Completed Stage" Convention

### Problem

The system architecture uses a "completed stage" convention: when a manager approves, `resolveForwardStatus('manager')` returns `manager_check` (the role's OWN stage), not the next stage. The next reviewer (auditor, skip-level, etc.) picks up KPIs at `manager_check`. This is the correct, normal resting state.

The reconciliation function's Branch 2b ("scored not forwarded") incorrectly treats `manager_check` with a `manager_score` as stuck and tries to advance it. This would mass-advance hundreds of correctly-waiting KPIs.

### Root Cause

Branch 2b blindly checks: "does the current stage have a score? If yes, advance." It doesn't account for the fact that `manager_check` with `manager_score` IS the expected forward status when the manager is not the terminal reviewer.

### Fix: DB Function `reconcile_workflow_statuses`

In Branch 2b, after detecting the current stage has a score, add a check: **is the current status the expected "forward status" for the role that scored it?** If yes, this is the normal completed state — skip it.

Specifically, for `manager_check`: if the next stage in the workflow is NOT `approved`, then `manager_check` with `manager_score` is the normal resting state (manager sets own stage as forward status per convention). Skip it.

The same logic applies symmetrically: `self_review` with `self_score` IS a real "scored not forwarded" because the employee's forward status should advance past `self_review`. Similarly, `audit` with `auditor_score` IS stuck because auditor's forward status uses `resolveNextStatus` (advances past `audit`).

**Concrete rule to add in Branch 2b:**
```
-- Manager convention: forward status = own stage when not terminal
IF v_kpi.current_status = 'manager_check' AND v_has_current_stage_score THEN
  -- Check if next stage after manager_check exists and is not 'approved'
  -- If so, manager_check + manager_score is the NORMAL completed state → skip
  FOR i IN 1..array_length(v_workflow_stages, 1) LOOP
    IF v_workflow_stages[i] = 'manager_check' AND i < array_length(v_workflow_stages, 1) THEN
      IF v_workflow_stages[i + 1] != 'approved' THEN
        -- Normal resting state, not stuck
        CONTINUE;  -- skip this KPI
      END IF;
    END IF;
  END LOOP;
END IF;
```

### No Other Changes Needed

- **Skip-level, auditor, HR PMS, management queues**: Already work correctly with the "completed stage" convention. No changes needed.
- **RLS policies**: Unaffected — they are role-based, not status-based.
- **Reports**: Unaffected — they read status directly.
- **Notification triggers**: Unaffected — reconciliation is an admin tool, not a normal workflow transition.
- **Workflow engine (workflowEngine.ts)**: No changes — architecture is correct as-is.

### Files Changed
1. **DB migration** — Update `reconcile_workflow_statuses` function: add the "normal resting state" exclusion in Branch 2b

### What This Preserves
- Branches 1 (orphaned stages), 2a (terminal completed), and 2c (review-stage mismatch) remain unchanged — they are correct
- Branch 2b still catches genuinely stuck KPIs (e.g., `self_review` with `self_score`, or `audit` with `auditor_score` when management_review follows)
- The "completed stage" convention (`manager_check` = "manager is done") is respected throughout

