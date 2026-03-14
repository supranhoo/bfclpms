

# Allow Daily KPI Submission with Zero Score When No Data Captured

## Problem
For Daily KPIs like "Daily Plant Visit Compliance," if the employee hasn't captured any daily data for the month, the system blocks submission entirely. The employee cannot submit with a score/rating of 0, even though missing all days should logically result in a 0 rating (especially under the "Missed Days Penalty" method where 5+ missed days = 0).

## Proposed Change

### File: `src/components/review/SelfReviewSheet.tsx`

**Current behavior (line 377-384):** When `aggregatedScore === null` (no entries), submission is blocked with an error toast.

**New behavior:** Instead of blocking, allow submission with score = 0 and rating = 0 when the employee has no daily entries. The confirmation dialog should clearly warn: *"No daily entries were recorded. This will be submitted with a score of 0."*

Specifically:
1. Remove the hard block when `aggregatedScore === null` for daily/weekly KPIs
2. Treat null aggregated score as 0 for submission purposes
3. Set `self_score = 0`, `self_rating = 'red'`, `achieved_value = 0`
4. Auto-generate remarks like: `"Missed Days Penalty: 0 of {expectedDays} days submitted — Score 0"`
5. Show a warning confirmation before proceeding (reuse the existing `showMonthlySubmitConfirm` dialog pattern but with a prominent warning)

This is a single-file change in `SelfReviewSheet.tsx`, modifying the `handleSubmitMonthlyReview` function and the confirmation dialog text.

