

# Fix: N/A Not Showing for Current-Stage Reviewer Submissions

## Problem

When the skip-level reviewer marks a KPI as N/A, the KPI table still shows "--" in the Skip-Level column instead of "N/A" (as seen in image-101 for employee 100847, Jaspal).

## Root Cause

The `isStageCompleted` function in `KpiDetailsTable.tsx` uses a **strict greater-than** comparison (`statusIdx > stageIdx`). Per the workflow convention, a status like `skip_level_check` means the skip-level stage **is already completed** (waiting for the next reviewer). Since the status name matches the stage name, `statusIdx === stageIdx`, and the function incorrectly returns `false`.

Example for this KPI:
- Status: `skip_level_check`
- Column: `skip_level_score` maps to stage `skip_level_check`
- `stageIdx === statusIdx` so `>` returns false -- should show N/A but shows "--"

## Fix

Change `statusIdx > stageIdx` to `statusIdx >= stageIdx` in the `isStageCompleted` function (line 50).

This single-character change correctly recognizes that a status matching a stage means that stage is complete.

## Files Changed

| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | Line 50: change `>` to `>=` |
| `DOCUMENTATION.md` | Patch note for the fix |

## Expected Result

For Jaspal (100847), "Implement 5S practices" KPI:
- Self column: 5 (has score)
- Manager column: 4 (has score)
- Skip-Level column: **N/A** (completed stage, no score -- was marked N/A)

