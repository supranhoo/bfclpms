
RCA confirmed: employee 101784 is not the same data case as the earlier HR PMS issue.

What I verified
- 101784’s January 2026 workflow is `kra_set → self_review → manager_check → approved`
- All 10 January KPIs are currently at `manager_check`
- Several of those KPIs already have `manager_score` filled, so they were effectively completed at manager level
- The current reconciliation function does not touch them, because `manager_check` still exists in the workflow, so they are not treated as “orphaned”
- Result: they look stuck even though there is no downstream reviewer for that month

Actual root cause
- We fixed “status missing from workflow”
- But we did not fix “status still exists, yet is the final actionable stage and can no longer move anywhere”
- That creates a second class of stale data:
  1. Missing-stage orphaned KPI
  2. Terminal-stage stale KPI

Plan to fix

1. Extend backend reconciliation logic
- Update `reconcile_workflow_statuses` so it handles both classes:
  - `missing_stage_orphan` → keep current reroute behavior
  - `terminal_stage_stale` → new behavior
- New terminal-stage rules:
  - If KPI is sitting at the last non-approved stage in the employee’s active workflow, and reviewer data for that stage already exists, auto-finalize it to `approved`
  - If KPI is sitting at that terminal stage but reviewer data is missing, move it back to the previous actionable status so the reviewer can actually act on it
- For 101784 this means:
  - rows with manager review data → `approved`
  - rows without manager review data → back to `self_review`

2. Return reason codes from reconciliation
- Enhance the function response with a reason such as:
  - `missing_stage_orphan`
  - `terminal_stage_completed`
  - `terminal_stage_unreviewed`
- This will make the admin tool explain exactly why each KPI is being moved

3. Upgrade the admin reconciliation UI
- Update `src/components/admin/ReconcileOrphanedKpisDialog.tsx`
- Rename the concept from only “Orphaned KPIs” to a broader “Workflow Status Reconciliation”
- Show:
  - current status
  - target status
  - reason category
  - whether the row will be approved or reopened

4. Add UI guardrails in review screens
- In reviewer scorecard/table/tracker, detect KPIs that are in a terminal stale state
- Show an amber warning badge like “Needs Reconcile” instead of a misleading normal stage label
- This prevents future confusion before the repair action is run

5. Run a one-time repair for affected periods
- After deploying the reconciliation update, run it for the affected month/year (starting with January 2026)
- This should clean both:
  - old HR PMS mismatches like 100705
  - terminal manager-stage cases like 101784

Files to update
- `supabase/migrations/...sql` — extend `reconcile_workflow_statuses`
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx` — broaden reconciliation UI/copy
- `src/components/review/KpiDetailsTable.tsx` — add terminal-stale badge
- `src/components/review/WorkflowProgressTracker.tsx` — avoid misleading stage counts/status display
- `src/components/review/UnifiedScorecard.tsx` — surface the warning state consistently

Validation after implementation
- 101784 should no longer show all KPIs stranded at `manager_check`
- completed manager-reviewed KPIs should become `approved`
- incomplete ones should reopen into a real actionable state
- 100705-style removed-stage cases must still reconcile correctly
