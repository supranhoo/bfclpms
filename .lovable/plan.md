

# Fix Zero-Score Truthy Bug Across Reports and Import

## Problem

JavaScript treats `0` as falsy. Several places in the codebase use truthy checks (`if (value)`) instead of null-safe checks (`if (value != null)`) on score fields. When a score is explicitly `0`, these checks fail and the value is silently dropped.

This affects:
1. **Monthly Scorecard Report** -- weighted score calculations skip score=0, making it appear as if no data exists in exports
2. **Import status inference** -- when `auditRating=0` is imported without an explicit `reviewStatus` column, the status fallback logic fails to detect audit data, potentially assigning a wrong status

The database **does** store the correct values (confirmed: `auditor_score=0.00`, `kpi_status=locked`). The bug is in the report/export calculations that read and aggregate these values.

## Changes

### 1. `src/pages/reports/MonthlyScorecardReport.tsx` (lines 211-225)

Replace truthy checks with null-safe checks so score=0 is included in weighted calculations:

```text
// BEFORE (buggy):
if (submission.self_score) { ... }
if (submission.manager_score) { ... }
if (submission.auditor_score) { ... }
if (submission.management_score) { ... }
if (submission.final_score) { ... completedKpis++; }

// AFTER (fixed):
if (submission.self_score != null) { ... }
if (submission.manager_score != null) { ... }
if (submission.auditor_score != null) { ... }
if (submission.management_score != null) { ... }
if (submission.final_score != null) { ... completedKpis++; }
```

### 2. `supabase/functions/import-kpis/index.ts` (lines 237-252)

Replace truthy checks in `determineReviewStatus` and `determineKpiStatus` so `rating=0` is recognized:

```text
// BEFORE (buggy):
if (row.auditRating || row.auditTargetAchieved) return 'approved';
if (row.managerRating || row.managerTargetAchieved) return 'audit';

// AFTER (fixed):
if (row.auditRating != null || row.auditTargetAchieved != null) return 'approved';
if (row.managerRating != null || row.managerTargetAchieved != null) return 'audit';
// (same pattern for all lines in both functions)
```

Note: The `isEmpty` helper (line 851) and `??` operators used elsewhere in the import function already handle zero correctly -- only these two status-inference functions have the bug.

### 3. `DOCUMENTATION.md`

Add a note documenting the zero-score truthy bug fix and the rule to always use `!= null` checks for score/rating fields.

## What Does NOT Need Fixing

- **`EmployeePerformanceSummary.tsx`**: Already uses `??` (nullish coalescing) -- correct.
- **`finalScore || 0` patterns** in `pdfExport.ts` and `MonthlyScorecardReport.tsx` line 287: `0 || 0` evaluates to `0`, which is the correct result. These are safe.
- **Dashboard scoring** in `useCumulativeKpis` and `Dashboard.tsx`: Uses `?? 0` pattern -- correct.
- **Database values**: Already stored correctly (`auditor_score=0.00`, `final_score=0.00`, `kpi_status=locked`). No data migration needed.

