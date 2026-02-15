

# Fix: N/A Still Showing on All Columns and All Journey Stages

## Problem

For employee 200679's "HRMS implementation" KPI (January 2026), despite the per-stage N/A fix already deployed:
- The KPI table shows "N/A" in ALL score columns (Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt, Final)
- The Review Journey shows "N/A" in Manager, Skip-Level, and HR PMS stages -- which should show "Pending" since they haven't been reached yet

## Root Cause (2 remaining bugs)

| # | File | Line | Bug |
|---|---|---|---|
| 1 | `KpiDetailsTable.tsx` | 348 | Score columns use `isNaKpi` (the global `submission.is_na` flag) to blanket-show "N/A" for EVERY column. Even if a reviewer later provides a score in their column, it gets hidden behind the N/A badge. |
| 2 | `KpiJourneySection.tsx` | 169 | The per-stage check `globalIsNA && data.score === null` correctly excludes scored stages, but it ALSO marks **pending** stages (not yet reached in the workflow) as N/A. Pending stages should show "Pending", not "N/A". |

## Fix

### 1. KpiDetailsTable.tsx -- Per-column N/A display (line 348)

**Before:**
```typescript
{isNaKpi ? (
  <Badge>N/A</Badge>
) : (
  renderScoreCell(score)
)}
```

**After:**
```typescript
{isNaKpi && score === null ? (
  <Badge>N/A</Badge>
) : (
  renderScoreCell(score)
)}
```

Only show N/A badge when the KPI is globally N/A **and** that specific column has no score. If a reviewer provided a score (after override), show the score.

### 2. KpiJourneySection.tsx -- Exclude pending stages from N/A (line 169)

**Before:**
```typescript
const stageIsNA = globalIsNA && data.score === null;
```

**After:**
```typescript
const stageIsNA = globalIsNA && data.score === null && status !== 'pending';
```

Pending stages (not yet reached in the workflow) should display "Pending" -- not "N/A". Only completed or current stages that lack a score should show N/A.

### 3. DOCUMENTATION.md -- Update

Document the refined per-column and per-stage N/A display logic.

## Expected Result After Fix

**KPI Table (image-97 scenario):**
- Self column: "N/A" (is_na=true, self_score=null) -- correct
- Manager/Skip-Level/HR PMS/Auditor/Mgmt/Final columns: "-" (no score yet, rendered by `renderScoreCell(null)`) -- correct

**Review Journey (image-98 scenario):**
- Self (Current): "N/A" badge with remarks -- correct
- Manager (Pending): "Pending" badge -- correct (was incorrectly showing "N/A")
- Skip-Level (Pending): "Pending" badge -- correct
- HR PMS (Pending): "Pending" badge -- correct

## Files Changed

| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | Line 348: Add `&& score === null` to N/A condition |
| `src/components/review/KpiJourneySection.tsx` | Line 169: Add `&& status !== 'pending'` to stageIsNA |
| `DOCUMENTATION.md` | Update N/A display documentation |

## Risk

- Minimal -- two single-line condition changes
- No database changes needed
- Backward compatible: scored columns/stages already work; only null+pending behavior changes

