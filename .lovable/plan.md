## Bug

Sajid Raza (Emp 100264), Feb-26 row:
- **All Months view:** 340.0 / 492.5 = **69.04%**
- **February-filtered view:** 140.0 / 257.5 = **54.37%**

Same employee, same month, same DB — two numbers. The February view is correct; the All-Months view inflates by counting frequency-locked KPIs that don't actually belong to February's cycle.

## Root Cause

`src/pages/reports/EmployeePerformanceSummary.tsx` lines 201-203:

```ts
const isLocked =
  selectedPeriod !== 'all' &&   // ← bug: locking gated on filter, not data
  isKpiLockedForPeriod(kpi.frequency, selectedPeriod, year, kpi.frequency_cycle_start);
```

When `selectedPeriod === 'all'`, `isLocked` is forced `false`, so Bi-Monthly/Quarterly KPIs that should only count in their cycle-start month leak into every month's aggregation. Toggling to a specific month re-applies the lock and the totals shrink.

The identical bug exists in the trend query (lines 354-384) which has **no lock check at all** — Period Comparison tab is therefore also inflated.

## Fix

Lock per-KPI against **the KPI's own `review_period`**, never against `selectedPeriod`. This makes the row for Feb-26 identical in both views.

### Change 1 — Main aggregation (lines 201-203)

```ts
const isLocked = isKpiLockedForPeriod(
  kpi.frequency,
  kpi.review_period,            // ← per-row, not filter-state
  kpi.review_year || year,
  kpi.frequency_cycle_start,
);
```

`showFreqLocked` toggle behavior is preserved (line 405 already hides rows with `kpiCount === 0 && lockedKpiCount > 0`).

### Change 2 — Trend query (lines 354-384)

Add the same per-row lock guard before accumulating, so Period Comparison stays consistent with the table:

```ts
const isLocked = isKpiLockedForPeriod(
  kpi.frequency,
  kpi.review_period,
  kpi.review_year || year,
  kpi.frequency_cycle_start,
);
if (isLocked) return;
```

### Change 3 — Tests

Add `src/test/employeePerformanceLockParity.test.ts` (pure-function extract of the per-row reducer) covering:
1. Bi-Monthly KPI with `frequency_cycle_start='February'` counted in Feb, excluded in Mar.
2. Same KPI excluded in both views' Feb-26 row produces identical `totalScore`/`outOfScore` regardless of `selectedPeriod`.
3. `is_na` submissions remain skipped.
4. Approved `final_score` takes precedence over stage scores (POLICY §88 immutability preserved).

To keep the reducer testable in isolation, extract the per-KPI block into `src/lib/employeePerformanceAgg.ts` (`reduceKpiIntoRow(...)`). The component imports it; no behavior change beyond Change 1.

## Out of scope

- No DB migrations, no edge functions, no RLS changes.
- No change to the 8-stage score fallback chain or `final_score` immutability.
- Excel export already reads from the same `filteredData`, so it inherits the fix automatically — no separate change.

## Verification steps

1. Open Employee Performance Summary → search 100264 → "All Months" → Feb-26 row should now show **140.0 / 257.5 = 54.37%** (matches February-filtered view).
2. Mar-26, Jan-26, Apr-26 rows: re-confirm with Jitendra that the corrected numbers match the per-month journey/scorecard.
3. Period Comparison tab for Sajid Raza: Feb data point should now equal 54.37%.
4. Toggle "Show frequency-locked KPIs" ON → locked KPIs re-appear in the row counts but `lockedKpiCount` is reported separately (unchanged behavior).
5. `npm test employeePerformanceLockParity` passes.

## Rollback

Single-file revert of `EmployeePerformanceSummary.tsx` + delete `employeePerformanceAgg.ts` + delete the test. No data to undo.

## Docs

- `DOCUMENTATION.md` → Reports section: clarify "month-row totals are always frequency-lock-filtered against the KPI's own period; the month filter is a row visibility filter, not an aggregation rule."
- `POLICY.md` → add §xxx "Report Aggregation Parity": *Any per-period row in any report MUST produce identical totals regardless of the active period filter. Lock/exclusion rules apply against the row's own `review_period`, never against the UI filter state.*
- Memory: add `mem://features/reports/aggregation-parity-rule` so future report code follows the same invariant.

## Files touched

- `src/pages/reports/EmployeePerformanceSummary.tsx` (2 small blocks)
- `src/lib/employeePerformanceAgg.ts` (new, ~40 lines)
- `src/test/employeePerformanceLockParity.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md` (sync)
- `mem://features/reports/aggregation-parity-rule` (new memory)
