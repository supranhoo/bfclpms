

## Fix: Remove False-Positive "Terminal Unreviewed" Rollbacks

### Problem
The reconciliation function rolls back ANY KPI at the terminal workflow stage if no score exists for that stage. But a KPI at "Management Review" without a management score is simply **pending review** — not stuck. This produces false positives (29 in the current scan) and would incorrectly demote KPIs if executed.

### Root Cause
In the `reconcile_workflow_statuses` function, the "terminal unreviewed" branch doesn't distinguish between:
- A KPI legitimately waiting for its terminal reviewer (normal)
- A KPI stuck at a terminal stage that was removed from the workflow (actually broken)

The second case is already handled by the `missing_stage_orphan` branch (KPI status not in workflow stages). So the `terminal_stage_unreviewed` branch only fires for KPIs that ARE in the workflow — meaning they're just pending, not stuck.

### Fix
**Database migration**: Remove the `terminal_stage_unreviewed` rollback branch entirely from `reconcile_workflow_statuses`. If a KPI is at its terminal stage and has no score, it's simply waiting for the reviewer — no action needed. The only valid terminal-stage reconciliation is `terminal_stage_completed` (score exists but KPI wasn't advanced to approved).

Specifically, change the terminal-stage logic from:
```
IF has_terminal_score THEN
  → approved (terminal_stage_completed)
ELSE
  → rollback to previous stage (terminal_stage_unreviewed)  ← REMOVE THIS
END IF
```
To:
```
IF has_terminal_score THEN
  → approved (terminal_stage_completed)
ELSE
  CONTINUE;  -- KPI is pending review, nothing to fix
END IF
```

Also clean up the `REASON_CONFIG` in `ReconcileOrphanedKpisDialog.tsx` to remove the now-unused `terminal_stage_unreviewed` reason entry (optional, harmless to keep).

### Files Changed
1. `supabase/migrations/` — new migration to update the function
2. `src/components/admin/ReconcileOrphanedKpisDialog.tsx` — remove the unused reason config entry

### Expected Outcome
- The 29 false-positive "terminal→reopened" results will no longer appear
- Only genuinely stuck/orphaned KPIs will be flagged
- KPIs legitimately waiting for their terminal reviewer are left alone

