
## Problem

The `percolate_multimonth_score` trigger on the `kpis` table only fires when `status` transitions **to** `approved`. If scores are changed **after** approval (e.g., admin edits management_score from 5 to 0 on March), the sibling months (e.g., February) never receive the updated scores.

**Verified case**: Jitendra Dwivedi's AFBC Incentive KPI (Bi-Monthly, Feb-Mar cycle):
- March (terminal): management_score=0, final_score=0, final_rating=red
- February (sibling): self_score=5, all other scores NULL — never updated after March's post-approval edit

Timeline from audit logs:
1. March approved at 11:24:53 — percolation fired, copied `is_na=true` to Feb
2. Admin then edited March's submission at 11:25:46 — changed `is_na` to false, set `management_score=0`, `final_score=0`
3. No re-percolation occurred because March's status was already `approved`

## Fix

### 1. New DB trigger: `trg_repercolate_on_submission_update` on `review_submissions`

A new AFTER UPDATE trigger on `review_submissions` that:
- Checks if the parent KPI is multi-month, approved, and the terminal month of its cycle
- Compares OLD vs NEW score columns — only fires if any score/rating/achieved_value/is_na actually changed
- Copies all score fields to sibling month submissions (same logic as existing percolation)
- Sets `app.percolation_bypass` to avoid frequency lock conflicts
- Logs `SCORE_REPERCOLATED` audit action on each sibling

Guard conditions (skip if):
- KPI status is not `approved`
- KPI is not a multi-month frequency
- KPI review_period is not the terminal month
- No score columns actually changed

### 2. One-shot data repair for Feb-Mar AFBC Incentive

Run a data repair to copy March's current scores to February's submission for the affected KPI.

### 3. Update POLICY.md and memory

Add a policy note that post-approval score edits on terminal months trigger automatic re-percolation to siblings.

## Technical Details

```sql
-- Trigger function on review_submissions
CREATE OR REPLACE FUNCTION public.repercolate_on_submission_update()
RETURNS trigger ...
-- Fires AFTER UPDATE on review_submissions
-- Looks up parent kpi: frequency, status, review_period
-- If approved + terminal month + score changed → copy to siblings
```

The trigger reuses the same sibling-finding logic as `percolate_multimonth_score` (matching on employee_id, kra_name, kpi_name, review_year, frequency, cycle months).

### Files to modify
- New migration: create `repercolate_on_submission_update` trigger function + attach to `review_submissions`
- New migration: one-shot repair for the affected Feb submission
- `POLICY.md`: add re-percolation policy note
- Memory file update: `mem/architecture/pms/multimonth-percolation`
