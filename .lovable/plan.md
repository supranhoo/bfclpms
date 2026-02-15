

# Fix: N/A Showing on All Journey Stages + Missing `na_marked_by_role`

## Problem

Employee 200679 (Twinkle Kumar) has a KPI "HRMS implementation" for January 2026 marked as N/A during self-review. The screenshot shows:
- ALL review journey stages (Self, Manager, Skip-Level, HR PMS) display "N/A" -- even though only Self marked it
- `na_marked_by_role` is `null` in the database (should be `'employee'`)
- The manager (Jaspal, 101125) provided a score/observation but the system still shows N/A everywhere

## Root Cause Analysis (3 bugs)

| # | File | Bug |
|---|---|---|
| 1 | `src/hooks/useKpis.ts` line 491 | `useSubmitSelfReview` sets `is_na: true` but NEVER sets `na_marked_by_role: 'employee'` -- field stays `null` |
| 2 | `src/components/review/KpiJourneySection.tsx` line 179 | Passes the SAME global `isNA` flag to ALL `ReviewStageCard` components -- every stage shows "N/A" instead of only the stage that marked it |
| 3 | `src/hooks/useKpis.ts` lines 526-536 | Optimistic cache update for self-review submissions doesn't include `na_marked_by_role` |

## Solution

### 1. Fix `useSubmitSelfReview` -- set `na_marked_by_role` (useKpis.ts)

In the upsert call (line 483-495), add `na_marked_by_role: is_na ? 'employee' : null` so the database correctly records who marked the N/A. Also add it to the optimistic cache update.

### 2. Fix Review Journey -- per-stage N/A display (KpiJourneySection.tsx)

Replace the global `isNA` prop passed to each `ReviewStageCard` with a per-stage calculation:
- A stage should show "N/A" ONLY if: the KPI is globally N/A AND the stage has no score of its own
- If a reviewer at a later stage provided a score (after overriding N/A), that stage shows the score, not "N/A"
- The stage that originally marked N/A shows "N/A" with its remarks

### 3. Fix existing data -- patch null `na_marked_by_role`

For all existing records where `is_na = true` and `na_marked_by_role IS NULL`, set `na_marked_by_role = 'employee'` since self-review is the only path that had this bug.

## Detailed Changes

| File | Change |
|---|---|
| `src/hooks/useKpis.ts` | Add `na_marked_by_role: is_na ? 'employee' : null` to the upsert in `useSubmitSelfReview` (line 491) and to the optimistic update (line 534) |
| `src/components/review/KpiJourneySection.tsx` | Compute per-stage `isNA` based on whether the stage has a score, instead of using the global `submission?.is_na` for all stages |
| `src/components/review/ReviewStageCard.tsx` | No change needed -- it already handles `isNA` per-instance correctly |
| `DOCUMENTATION.md` | Document the fix |

## Technical Detail: Per-Stage N/A Logic

For each stage in the journey:

```text
stageIsNA = (global is_na === true) AND (this stage's score is null)
```

This means:
- Self stage: if is_na=true and self_score=null --> shows N/A (correct)
- Manager stage: if is_na=true but manager_score=4 --> shows score 4 (override worked)
- Manager stage: if is_na=true and manager_score=null --> shows N/A (hasn't reviewed yet)

## Data Fix

A one-time SQL update to fix existing records:
```text
UPDATE review_submissions
SET na_marked_by_role = 'employee'
WHERE is_na = true AND na_marked_by_role IS NULL;
```

## Expected Result

After fix, the Review Journey for this KPI will show:
- Self: "N/A" badge with self remarks (correct -- employee marked it)
- Manager/Skip-Level/HR PMS: "Pending" or actual score (NOT blanket "N/A")

## Risk Assessment

- Low risk -- no schema changes, only logic fixes
- Backward compatible -- stages that were correctly scored will now display properly
- The data fix is safe: the only code path that sets `is_na=true` without `na_marked_by_role` is `useSubmitSelfReview`, so all null cases are employee-initiated

