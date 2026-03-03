

# Fix: Highlight Eliminated KPI Months in Light Red

## Problem
When a KPI exists in earlier months but disappears (shows `--`) in later months, the `--` is displayed in faint grey. The user wants these "eliminated" cells highlighted in light red, matching the mismatch styling, to make it visually obvious that a KPI was dropped.

## Logic

Current code (line 309-321) treats all `null` months the same — faint grey text. The fix adds a check: if a KPI has data in any **earlier** month but is `null` in the current month, it is considered "eliminated" and gets the red highlight.

**Detection**: For each `--` cell, check if any preceding month (in fiscal order) had a non-null weightage. If yes → eliminated → light red background.

## File Change

**`src/pages/admin/KpiWeightageDashboard.tsx`** — lines 306-322

```typescript
{months.map((m, mIdx) => {
  const w = kpi.months[m];
  const isMismatch = w != null && kpi.baselineWeightage != null && w !== kpi.baselineWeightage;
  const noData = w == null;
  // "Eliminated" = no data this month, but had data in a prior month
  const isEliminated = noData && months.slice(0, mIdx).some(prev => kpi.months[prev] != null);
  return (
    <TableCell
      key={m}
      className={`text-center text-sm ${
        isEliminated
          ? 'bg-destructive/10 text-destructive font-medium'
          : noData
            ? 'text-muted-foreground/40'
            : isMismatch
              ? 'bg-destructive/10 text-destructive font-medium'
              : ''
      }`}
    >
      {noData ? '--' : `${w}%`}
    </TableCell>
  );
})}
```

Also update `hasMismatch` detection in `useKpiWeightageMatrix.ts` to flag KPIs that have eliminated months (optional — the visual highlight is the primary ask).

**1 file change, no DB migration.**

