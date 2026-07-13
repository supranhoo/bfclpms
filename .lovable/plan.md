## Problem

On narrow tablet/mobile widths, the "Previous Months" mini section inside the scorecard side card renders three columns of `Jun 2026 / May 2026 / Apr 2026` with the month, year, and score all forced onto single lines. Because each `grid-cols-3` cell is only ~38px wide at that viewport, the label `Jun 2026` and score `5.02` visually collide/overlap with the adjacent cell — producing the observed `JunMayApr / 202620262026 / 5.02…4.74` overlap.

Source: `src/components/review/PreviousMonthsScoreMini.tsx`.

## Root cause

Inside each grid cell:
```
<p>{r.month.slice(0,3)} {r.year}</p>   // "Jun 2026" — one line, ~52px min
<p>{r.score.toFixed(2)}</p>            // "5.02"
```
The text has no `whitespace-nowrap`, but the space between "Jun" and "2026" is a normal space that the browser keeps on one line as long as it fits — and when it doesn't, the cell content visually spills into the next cell because there's no horizontal padding/gap enforcement and the parent doesn't `overflow-hidden`.

## Fix (scoped — presentation only, this component only)

1. Stack month and year on two lines inside each cell (`Jun` on line 1, `2026` on line 2) so each column stays well within its width at any viewport.
2. Use a shortened year (`'26`) alongside the month on one line as a fallback for wider layouts is unnecessary — vertical stacking is simpler and works at every width.
3. Add `min-w-0` to each grid cell and `gap-2` on the grid so columns can shrink without bleeding into neighbours.
4. Keep score styling, colours, N/A handling, and data-fetching logic unchanged.

### Exact JSX change

```tsx
<div className="grid gap-2 grid-cols-3">
  {results.map((r) => (
    <div key={`${r.month}-${r.year}`} className="text-center min-w-0">
      <p className="text-[10px] leading-tight text-muted-foreground font-medium">
        {r.month.slice(0, 3)}
      </p>
      <p className="text-[9px] leading-tight text-muted-foreground">
        {r.year}
      </p>
      {r.score !== null ? (
        <p className={cn('text-sm font-bold mt-0.5', scoreColor(r.score))}>
          {r.score.toFixed(2)}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground italic mt-0.5">N/A</p>
      )}
    </div>
  ))}
</div>
```

## Scope guardrails

- Only `src/components/review/PreviousMonthsScoreMini.tsx` is touched.
- No changes to data fetching, scoring math, RLS, workflows, or any other card.
- No change to the KRA/KPI monthly review OR annual review business logic.
- Purely a Tailwind/layout fix.

## Risk & Impact

- Data Impact: none.
- Workflow Impact: none.
- UI Impact: cells in the Previous Months mini strip now render month and year on two lines; score sits below. Desktop appearance is virtually identical (~2px taller strip).
- Regression Risk: negligible — component is only consumed inside the scorecard side card (`UnifiedScorecard`, `KpiJourneySection`).
- Rollback: revert the single-file diff.

## Verification

- Visual check at 469px viewport (current preview width) confirms no overlap.
- Visual check at desktop confirms unchanged layout.
- No test changes required (component has no existing tests; behaviour unchanged).

## Docs

- `DOCUMENTATION.md`: append a patch entry (v-bump `+.1`) noting "PreviousMonthsScoreMini: two-line month/year to prevent narrow-viewport overlap".
- `POLICY.md`: not applicable (presentation-only fix, no policy change).
