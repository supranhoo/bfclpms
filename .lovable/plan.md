

# Fix: Score Columns Showing "N/A" Instead of "—" for In-Progress Stages

## Root Cause

In `KpiDetailsTable.tsx`, the `isStageCompleted` function (line 52) uses `>=` comparison:

```typescript
return statusIdx >= stageIdx;
```

This means when a KPI is **at** a stage (e.g., status = `hr_pms_review`), the function considers that stage "completed." Combined with the score cell logic (line 441):

```typescript
const showNA = score === null && stageCompleted;
```

If the reviewer hasn't scored yet (score is null) and the KPI is at their stage, it incorrectly shows **"N/A"** instead of **"—"** (pending).

From the screenshot: KPIs like "Labour supply wages" are at `hr_pms_review` status. HR PMS hasn't scored yet, so `hr_pms_score` is null. But `statusIdx(hr_pms_review) >= stageIdx(hr_pms_review)` is true, triggering the N/A badge.

**A stage should only be considered "completed" if the KPI has moved PAST it** — strict greater-than.

## Fix

### File: `src/components/review/KpiDetailsTable.tsx`

**Line 52**: Change `>=` to `>`:

```typescript
return statusIdx > stageIdx;
```

This ensures:
- KPI at `hr_pms_review` with null `hr_pms_score` → shows "—" (pending, correct)
- KPI at `audit` with null `hr_pms_score` → shows "N/A" (stage passed without score, correct)
- KPI at `manager_check` with `self_score = 5` → shows "5" (unchanged, correct)

## Risk Assessment
- **Data Impact**: None — display-only change
- **Regression Risk**: Very low — only changes when "N/A" badge appears vs a dash
- **Workflow Impact**: None

