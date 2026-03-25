

## Push 92 Stuck KPIs from `audit` to Next Workflow Stage

### Problem
92 KPIs have auditor scores saved but remain at `audit` status because the "Advance workflow status" toggle was off during admin data entry. The existing reconciliation tool does not catch this case (it only detects scores at stages *ahead* of current status, not *at* the current stage).

### Approach

**Step 1: Add a new reconciliation class (CLASS 4) to `reconcile_workflow_statuses` DB function**

Add logic to detect KPIs where a reviewer score exists for the *current* stage but the KPI was never advanced. For example: status = `audit` and `auditor_score IS NOT NULL` → advance to the next stage in the workflow (e.g., `management_review`).

This will be a new reason: `current_stage_scored_not_forwarded`.

The mapping:
- `self_review` + `self_score` → next stage
- `manager_check` + `manager_score` → next stage  
- `audit` + `auditor_score` → next stage
- `management_review` + `management_score` → `approved`
- (and similarly for skip_level, hr_pms)

**Step 2: Update the ReconcileOrphanedKpisDialog UI**

Add the new reason to the `REASON_CONFIG` map so it displays properly in the dry-run preview table (e.g., "Scored but Not Forwarded" badge).

**Step 3: Run reconciliation**

After deploying, run the reconciliation tool from the Workflow Config page with dry-run first, then execute — this will advance all 92 KPIs.

**Step 4: Add safeguard to AdminDataEntryDialog**

Default the "Advance workflow status" toggle to ON when `roleLevel` is `auditor` or `management`, and show a warning toast if the user turns it off, to prevent this issue from recurring.

### Technical Details

- **Migration**: Modify the `reconcile_workflow_statuses` function to add CLASS 4 logic after CLASS 3, checking if the score column matching the current status has data
- **UI change**: Add `current_stage_scored_not_forwarded` entry to `REASON_CONFIG` in `ReconcileOrphanedKpisDialog.tsx`
- **Safeguard**: Modify the `useEffect` in `AdminDataEntryDialog.tsx` (~line 440) to also default `advanceStatus = true` for auditor/management roles, and add a warning when toggling off

### Files Changed
1. `supabase/migrations/` — new migration to update `reconcile_workflow_statuses` function
2. `src/components/admin/ReconcileOrphanedKpisDialog.tsx` — add new reason badge
3. `src/components/admin/AdminDataEntryDialog.tsx` — safeguard toggle behavior

