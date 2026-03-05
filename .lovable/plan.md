

# RCA Complete: Binary/Tiered KPI Bug Scope Across All Reviewer Levels

## Analysis Summary

I audited every location where `calculateRating()` is called during score initialization across all reviewer types. Here are the results:

### Affected Components and Status

| Component | Reviewer Level | Uses `calculateRating()` | Fixed by deployed patch? |
|---|---|---|---|
| `UnifiedScorecard.tsx` (line 669) | Manager, Skip-Level, HR PMS | Yes — converts to `parseFloat` then calls `calculateRating` with `uom_type` + `qualitative_options` | **Yes** — reverse-mapping now handles numeric `5` → "Yes" → rating 5 |
| `AuditScorecard.tsx` (line 388) | Auditor | Same pattern — `parseFloat` then `calculateRating` with full params | **Yes** — same fix applies |
| `ManagementScorecard.tsx` (line 453) | Management | Same pattern — `parseFloat` then `calculateRating` with full params | **Yes** — same fix applies |
| `AchievedValueScoreInput.tsx` (line 103) | All levels (auto-recalc effect) | Same — `parseFloat` then `calculateRating` | **Yes** — same fix applies |
| `SelfReviewSheet.tsx` (line 226) | Employee (self) | Calls `calculateRating` with full params | **Yes** |
| `AdminDataEntryDialog.tsx` (line 186) | Admin data entry | Calls `calculateRating` with full params | **Yes** |
| `ScoringSimulatorPopover.tsx` (line 47) | Admin simulator | Calls `calculateRating` with full params | **Yes** |

### Conclusion

**No additional code changes are required.** The fix deployed in `src/lib/ratingCalculation.ts` (adding the numeric-to-option reverse-mapping block at line 161-175) is the single fix point. Since all 7 call sites pass `uom_type` and `qualitative_options` to the same `calculateRating` function, the fix propagates to every reviewer level automatically.

The bug affected: Manager, Skip-Level, HR PMS, Auditor, Management, and Admin Data Entry — essentially every reviewer type. All are now covered by the single engine-level fix.

### Already-Corrupted Data

KPIs that were reviewed **before** this fix may have incorrect scores persisted in the database (e.g., `skip_level_score = 0` when it should be `5`). These need one of:
1. The reviewer re-opens and re-submits the KPI (the correct score will now initialize)
2. An admin sends the KPI back to the affected stage for re-review
3. A direct database correction for known affected records

No further code changes are needed — the deployed fix covers all reviewer levels comprehensively.

