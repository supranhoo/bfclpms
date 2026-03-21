

## Fix: N/A Display on Dashboard + Pending Reviews False-Positive

### Two Issues Found

**Issue 1 — Score columns show "—" instead of "N/A"**
In `KpiDetailsTable.tsx`, the N/A badge only appears when a stage is *completed* (status has moved past it) and score is null. But when a reviewer marks N/A at their own stage, the KPI status stays at that stage (e.g., `manager_check`), so the stage isn't "completed" — the cell shows "—" instead of "N/A".

**Fix**: Check `submission.is_na` alongside the existing `stageCompleted` check. If `is_na = true` and the score for that column is null and the stage is at or past the current status, show "N/A".

**Issue 2 — Pending Reviews false-positive for N/A KPIs**
The filter in `usePendingSelfReviews.ts` only excludes KPIs where the score column is not null. N/A KPIs have null scores, so they appear as "pending" even though they've been reviewed.

**Fix**: Change the query filter from `.not('manager_score', 'is', null)` to `.or('manager_score.not.is.null,is_na.eq.true')` — same for skip-level.

### Files Modified

#### 1. `src/components/review/KpiDetailsTable.tsx` (lines 460-473)
Update the score cell rendering logic to check `submission?.is_na`:
```
// Current:
const showNA = score === null && stageCompleted;

// Fixed:
const showNA = score === null && (stageCompleted || (submission?.is_na && isStageCompleted_or_current));
```
Specifically: if `is_na = true`, score is null, and the stage index ≤ current status index (stage is at or past), show "N/A" badge.

#### 2. `src/hooks/usePendingSelfReviews.ts`
- **Line 168**: Change `.not('manager_score', 'is', null)` → `.or('manager_score.not.is.null,is_na.eq.true')`
- **Line 1074**: Change `.not('skip_level_score', 'is', null)` → `.or('skip_level_score.not.is.null,is_na.eq.true')`

### No database changes needed

