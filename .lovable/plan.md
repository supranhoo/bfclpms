

# Fix KPI Text Appearing as Columns Instead of Lines

## Root Cause

Line 309 in `KpiDetailsTable.tsx` has `flex items-center gap-1` on the `<p>` tag wrapping the KPI name text:

```html
<p className="text-sm text-muted-foreground flex items-center gap-1 whitespace-pre-wrap">
  {renderBoldKpiText(kpi.kpi_name)}
  <Info ... />
</p>
```

The `flex` layout treats each text segment returned by `renderBoldKpiText()` as a separate flex item and lays them out **horizontally**. This overrides `whitespace-pre-wrap`, causing Description, Formula, and Scoring Logic to spread across the cell like separate columns instead of stacking as lines.

## Fix

Remove `flex` from the `<p>` tag and wrap the Info icon separately so it doesn't interfere with text flow:

```html
<div className="relative">
  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
    {renderBoldKpiText(kpi.kpi_name)}
  </p>
  <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 ... absolute top-0 right-0" />
</div>
```

This keeps the Info hover icon visible but lets the KPI text flow naturally with line breaks preserved -- exactly matching the second reference image.

## Files Changed

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | Remove `flex` from KPI name paragraph, reposition Info icon |
| `DOCUMENTATION.md` | Minor update noting the layout fix |

## Result

The KPI cell will display exactly like the second image: all text in one cell, each section (Description, Formula, Scoring Logic) on its own line with bold markers, flowing naturally top-to-bottom.

## Impact

- **Display only** -- no data, scoring, or export changes
- **All dashboard levels** benefit (My KPIs, Team Review, Audit, Management) since they all use KpiDetailsTable

