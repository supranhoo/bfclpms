# ADR-252c — TNI report rendered another range's qualification set

## Status
Accepted — 2026-08-11

## Problem
With the filter set to Custom Apr → Jun 2026 (threshold 2, minimum 3 scored
months), the TNI report and its export showed evidence for **August 2026**
(`Aug 2026: 0.00`) and kept only 3 rows while claiming 1000 were excluded.

## Root cause
1. Verified `tni_qualified_kpis('[April,May,June] 2026', 2, 3)` returns only
   Apr/May/Jun months, and `training_needs` holds **no August 2026 rows** — so
   neither SQL nor data produced August.
2. `src/App.tsx` sets a global `placeholderData: (prev) => prev`. On a filter
   change the qualification query switches cache key and refetches, but React
   Query returns the **previous key's** payload (the page's default single-month
   view = current month, August) with `isLoading === false`.
3. The page filtered the freshly fetched Apr–Jun `training_needs` against the
   stale August index, so only accidental key matches survived and the evidence
   column printed August months.

## Decision
- Qualified payloads carry a `rangeKey` stamp (`tniRangeKey`). `TNIReport`
  discards the payload when the stamp differs from the active range and treats
  that as loading.
- `useTniQualifiedKpis` and `useTrainingNeeds` set `placeholderData: undefined`,
  opting out of the global carry-over: range-scoped analytics must show a
  spinner rather than another filter's numbers.
- Loading now includes `isFetching` and the stamp mismatch, so cards, tables and
  the "excluded" count never render against a stale set.
- Export is disabled while stale/fetching and gains a `Range` column.
- The detect-month target is clamped to a month inside the active range (the
  header no longer reads "Detect TNI (Aug)" for an Apr–Jun report).
- The obsolete 2-argument overload of `tni_qualified_kpis` was dropped.

## Consequences
The report reflects the SQL result for the selected range only. Slight loss of
"keep previous numbers while refetching" on this report — intentional.
Rollback: revert the hook options and recreate the dropped overload.

## Tests
`src/test/tni/rangeStamp.test.ts`, `src/test/tni/minScoredMonths.test.ts`,
`src/test/tni/continuityRule.test.ts`.
