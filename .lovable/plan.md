

## Plan: Wire `periodRanges` Through to UnifiedScorecard for Multi-Month Display

### Problem
The `UnifiedScorecard` (line 261-264) filters KPIs using only `selectedMonth` and `selectedYear`, so YTD/QTD/Custom modes show identical data to single-month mode despite the UI correctly computing `periodRanges`.

### Root Cause
`useKpisByEmployee` already fetches ALL KPIs for the employee (no period filter). The bottleneck is the client-side filter at line 261:
```ts
const kpis = allKpis?.filter(k =>
  k.review_period === selectedPeriod && k.review_year === selectedYear
);
```
This discards all months outside the selected one, even in multi-month modes.

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/components/review/UnifiedScorecard.tsx` (line 260-265) | Replace single-month filter with `periodRanges`-aware filter. Build a `Set` of `"month|year"` keys from `periodSelection.periodRanges`, then filter KPIs by membership in that set. |
| 2 | `src/components/review/UnifiedScorecard.tsx` (lines 273-278) | Update `useSubPeriodSubmissionsByKpis` and `useOrgKpiValues` calls to pass `periodRanges` instead of a single month/year (or pass the filtered KPI IDs which already cover multiple periods). |
| 3 | `src/components/review/UnifiedScorecard.tsx` | Add a visual indicator (badge/header text) when viewing cumulative data (e.g., "YTD: Jan–Apr 2026") so users know they're seeing aggregated results. |
| 4 | `src/pages/Dashboard.tsx` | No change needed — `periodSelection` (including `periodRanges`) is already passed to `UnifiedScorecard` via props. The EmployeeSelectorGrid already uses `periodRanges` correctly. |
| 5 | `DOCUMENTATION.md` / `POLICY.md` | Version bump and changelog entry for multi-period scorecard support. |

### Technical Detail

**New filter logic (change 1):**
```typescript
const periodSet = useMemo(() => {
  const s = new Set<string>();
  periodSelection.periodRanges.forEach(pr =>
    s.add(`${pr.month.trim().toLowerCase()}|${pr.year}`)
  );
  return s;
}, [periodSelection.periodRanges]);

const kpis = useMemo(() => allKpis?.filter(k => {
  const key = `${k.review_period?.trim().toLowerCase()}|${k.review_year}`;
  return periodSet.has(key);
}), [allKpis, periodSet]);
```

**Scope limitation**: In multi-month mode, the scorecard becomes **read-only** for review actions (approve/send-back). Reviewers must switch to single-month mode to take actions, because workflow stages and submissions are period-specific. This prevents cross-period approval errors.

### Risk Assessment
- **Data impact**: None — read-only query change
- **Regression risk**: Low — single-month mode (`periodRanges` has exactly 1 entry) produces identical behavior to current code
- **Workflow safety**: Multi-month mode disables write actions to prevent cross-period mutations

