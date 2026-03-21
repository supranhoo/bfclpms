

## Completed: Fix N/A Display on Dashboard + Pending Reviews False-Positive

### Changes Made

#### `src/components/review/KpiDetailsTable.tsx`
- **Added** `isStageAtOrBeforeCurrent()` helper to check if a workflow stage has been reached (at or past current status)
- **Fixed** score cell rendering: N/A badge now shows when `is_na = true`, score is null, and the stage has been reached — not just when stage is completed
- Previously N/A only showed after status moved past the stage; now it correctly shows at the current stage too

#### `src/hooks/usePendingSelfReviews.ts`
- **Fixed** manager pending filter: Changed from `.not('manager_score', 'is', null)` to `.or('manager_score.not.is.null,is_na.eq.true')` — excludes N/A-marked KPIs from pending list
- **Fixed** skip-level pending filter: Same pattern applied for `skip_level_score`

### Previous: Fix Manager Review False-Positive + Add Skip-Level Tab
- Fixed `useOverdueTeamReviewKpis`: excludes KPIs where `manager_score IS NOT NULL`
- Added `useOverdueSkipLevelKpis` hook and Pending Skip-Level Review tab

### No database changes needed
