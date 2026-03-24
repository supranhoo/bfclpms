
RCA for employee 100020

What I verified
- Employee 100020’s effective workflow for February 2026 is:
  `kra_set → self_review → audit → management_review → approved`
- Current February KPI statuses are:
  - 21 KPIs at `audit`
  - 3 KPIs still at `self_review`
- Those 3 `self_review` KPIs already contain `auditor_score` + `auditor_remarks`, and their audit log shows `AUDITOR_REVIEWED`
- Current workflow reconciliation dry-run returns `0`, so these rows are not orphaned/stale under the current repair logic

Actual root cause
- This is a different bug from the earlier workflow-mismatch issue.
- The remaining 3 KPIs are suffering from a status/data mismatch:
  - audit data was saved
  - but KPI status stayed at the prior stage (`self_review`)
- The inconsistency comes from `src/components/review/UnifiedScorecard.tsx`:
  - it computes `pendingStatus` from `resolvePendingStatuses(...)`
  - then on non-approve/save it writes `status = config.pendingStatus`
- For an auditor in a skipped-manager workflow, `pendingStatus` becomes `self_review`, because that is the auditor’s inbox-entry status
- But once the auditor has started reviewing, the KPI should move to the auditor-owned stage: `audit`
- So the code is using “queue entry status” as if it were “in-progress stage status”

Why 100020 still looks wrong
- Previous fixes repaired KPIs that were:
  1. at removed stages, or
  2. stuck at the terminal actionable stage
- These 3 KPIs are neither:
  - `self_review` is valid in the workflow
  - they are not terminal-stage rows
- So the reconciliation tool correctly ignores them today, even though the record is still inconsistent

Code-level mismatch
- `src/components/review/UnifiedScorecard.tsx`
  - builds `pendingStatus` from `resolvePendingStatuses(...)`
  - uses `pendingStatus` when saving without approve
- `src/components/review/AuditScorecard.tsx`
  - already does the correct thing for audit saves:
  - save review → `audit`
  - approve → next stage
- So the bug is specifically in the generic unified review flow, not in the workflow template itself

Fix plan
1. Add a distinct “active review stage” resolver
- In `src/lib/workflowEngine.ts`, add a helper for the reviewer-owned in-progress stage
- Example:
  - auditor → `audit`
  - hr_pms → `hr_pms_review`
  - management → `management_review`
- Keep this separate from `resolvePendingStatuses`, which should remain queue/inbox logic

2. Fix UnifiedScorecard save behavior
- Update `src/components/review/UnifiedScorecard.tsx`
- On non-approve/save:
  - use reviewer-owned active stage where applicable
  - not the first pending queue status
- For this case:
  - auditor save should move `self_review` → `audit`
  - not keep it at `self_review`

3. Extend repair logic for existing bad data
- Expand `reconcile_workflow_statuses` to detect a new class:
  - reviewer data exists, but KPI status is still at an earlier queue-entry stage
- Safe repair rule:
  - if `auditor_score` exists and workflow contains `audit`, move KPI to `audit`
  - similarly for `hr_pms_score` → `hr_pms_review`
  - optionally `management_score` → `management_review`
- Do not auto-forward these rows; just place them at the correct reviewer-owned stage

4. Update admin reconciliation UI
- Extend `src/components/admin/ReconcileOrphanedKpisDialog.tsx`
- Show a new reason such as:
  - `review_stage_mismatch`
- Label example:
  - “Review Data Exists, Status Behind”
- This lets admins safely repair rows like 100020 from the existing tool

5. Add tests
- `src/lib/workflowEngine.test.ts`
  - verify queue-entry status and active-stage status are different concepts
- review-flow tests / component logic tests
  - auditor save in `self_review → audit → management_review` workflow should save to `audit`
- reconciliation test coverage
  - auditor_score + status `self_review` should be detected as mismatch and repaired to `audit`

Targeted outcome for 100020
- The 3 inconsistent KPIs should move from `self_review` to `audit`
- The already-correct 21 KPIs at `audit` should remain unchanged
- Future audit saves in the unified review screen will no longer recreate this mismatch

Files to update
- `src/lib/workflowEngine.ts`
- `src/lib/workflowEngine.test.ts`
- `src/components/review/UnifiedScorecard.tsx`
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx`
- `supabase/migrations/...sql` (extend `reconcile_workflow_statuses`)
