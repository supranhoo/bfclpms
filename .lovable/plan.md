## What's broken (from your screenshot)

Three concrete defects, not styling preferences:

1. **Stuck floating tooltip** — "Assistant Accountant / Grade: JE-SE" hangs over the header. The Radix tooltip on employee-avatar headers fails to dismiss when the cursor leaves the trigger via fast scroll or when a second tooltip opens.
2. **Overlapping sticky category bands** — "MIS & REPORTING · 11 KPIs" visibly overlaps the previous category band ("…IMPROVEMENT · 6 KPIs"). Both rows are `position: sticky; top: 68px` with translucent backgrounds (`bg-muted/60 backdrop-blur-sm`), so when the next category scrolls into the stuck zone, both render simultaneously.
3. **Text bleed-through** — "Lower is Better" from a KPI row shows *through* the sticky category band for the same reason (translucent band).

## Risk & impact

- **Data impact:** None — pure presentation layer.
- **Workflow impact:** None.
- **Regression risk:** Low. Confined to one file. Sticky/z-index rules already documented in `mem://features/reports/kpi-employee-matrix-report.md` are preserved (thead z-30, sticky-left cells z-20, category band sticky-top).
- **Mitigation:** Keep the documented sticky hierarchy intact; only change opacity + tooltip lifecycle. Verify with preview screenshot before/after.

## Fixes (single file: `src/pages/reports/KpiEmployeeMatrix.tsx`)

### Fix 1 — Tooltip dismiss
- Set `<TooltipProvider delayDuration={300} disableHoverableContent>` so tooltips dismiss the instant the pointer leaves the trigger (no grace period to drift into a stuck state).
- Add a `useEffect` that listens for `scroll` on the matrix overflow container and dispatches a `pointerdown`/blur to force-close any open Radix tooltip during scroll.

### Fix 2 — Sticky band overlap
- Replace category band background `bg-muted/60 backdrop-blur-sm` → **solid** `bg-muted` (no transparency, no blur). The newer band in DOM order paints over the older one, eliminating the visible overlap.
- Same change for the KRA sub-band (`bg-muted/30` → `bg-muted/90` solid enough to mask).
- Keep `sticky top: COL.headerH` and z-indices as documented.

### Fix 3 — Text bleed
- Resolved by Fix 2 (solid bg masks anything underneath).
- Bonus: add `border-b border-border` already there; add subtle `shadow-[0_2px_4px_-2px_hsl(var(--foreground)/0.08)]` to the category band for a crisp seam.

### Light polish (in scope)
- Avatar header: round to `rounded-full ring-1 ring-border` and bump employee code to `text-[10px]` for legibility on the current viewport.
- Add `tabular-nums` to inline stats counts (already present in most, ensure all four).
- Category band: tighten left padding so the chevron aligns with the Sr. column gutter (`pl-2` instead of `px-2.5`).

## Verification

1. Reload `/reports/kpi-employee-matrix`, load matrix, scroll vertically through 3+ category transitions → confirm no overlapping bands, no bleed-through text.
2. Hover an employee avatar → tooltip appears; move cursor away or scroll → tooltip disappears within ~100ms.
3. Take browser screenshot after fix and visually compare to the broken state you shared.

## Out of scope

- No layout redesign, no palette changes, no new directions (you chose "Fix bugs + light polish").
- No changes to `useKpiEmployeeMatrix.ts`, RPCs, or scoring logic.
