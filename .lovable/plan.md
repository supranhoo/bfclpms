# Plan: Show Total Weightage in "Performance by Category" Title

## Goal
Append the sum of all included KPI weightages (for the selected period) to the "Performance by Category" card title, e.g.:

- `Performance by Category (100%)` — when all KPIs are scored
- `Performance by Category (98%)` — when some KPIs are N/A / excluded

This makes it instantly visible whether the scorecard reflects the full weight allocation for the month, or whether some weight is missing (N/A / unscored KPIs).

## Where
File: `src/components/review/UnifiedScorecard.tsx` (around line 1546)

The `scoreData.categoryScores` array already exposes a `weightage` per category, and `scoreData.totalWeight` exists. We will reuse `totalWeight` directly — it represents the effective sum of weightages used in the weighted score calculation (already excludes N/A per the N/A Status Governance memory).

## Changes

### 1. UnifiedScorecard.tsx — Title update
Replace:
```tsx
<CardTitle className="text-sm">Performance by Category</CardTitle>
```
with:
```tsx
<CardTitle className="text-sm flex items-center gap-2">
  Performance by Category
  <span className={cn(
    "text-xs font-medium px-1.5 py-0.5 rounded",
    totalWeightPct === 100
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
  )}>
    ({totalWeightPct}%)
  </span>
</CardTitle>
```
Where `totalWeightPct = Math.round(scoreData.totalWeight)`.

If `totalWeight < 100`, the amber pill signals to reviewers that some KPI weight is excluded (N/A or unscored). A tooltip on hover will say:
> "Total weightage of KPIs included in this scorecard. < 100% means some KPIs are N/A or unscored."

### 2. Description update (optional clarity)
Keep description as-is, OR enhance to:
> "Score breakdown across KRA categories — `{totalWeightPct}%` of total weightage included"

I recommend keeping the badge in the title only, to avoid repetition.

## Edge Cases
- **All N/A**: `totalWeight = 0` → show `(0%)` in amber, chart already shows empty state.
- **Multi-month aggregation (YTD/QTD)**: `totalWeight` is computed from filtered KPIs in scope; same logic applies. No special handling needed.
- **Rounding**: Use `Math.round()` so values like 99.7 display as `100%`. If precision matters we can switch to `toFixed(1)` — please confirm preference (default: rounded integer).

## Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — pure UI, reuses existing `scoreData.totalWeight` |
| Workflow | None |
| UI/UX | Minor additive change, single Card title; no layout shift |
| RLS / Security | Not affected |
| Regression | Very low — title-only change in `UnifiedScorecard` |

## Tests
Add `src/test/scorecard/categoryWeightageBadge.test.tsx`:
- Renders `(100%)` with green pill when all KPIs weighted 100.
- Renders `(98%)` with amber pill when one KPI is N/A (2% weight excluded).
- Renders `(0%)` when all KPIs are N/A.

## Files Edited
- `src/components/review/UnifiedScorecard.tsx`
- `src/test/scorecard/categoryWeightageBadge.test.tsx` (new)
- `mem/features/review/unified-scorecard-component` (note the badge convention)

## Out of Scope
- The `PerformanceReport.tsx` page also has a "Performance by Category" card (line 197). Confirm if you want the same badge there too — not included by default. Let me know and I'll extend.
