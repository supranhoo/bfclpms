## Issue
On tablet viewport, the **Metrics & Scale** card (`src/components/review/KpiMetricsSection.tsx`) breaks visually:
- Target value `100` and `%` stack awkwardly under the label
- "Higher / Better" criteria wraps over the icon
- Frequency/Source values (`MgrBdyrceMa...`) overlap and truncate badly

Root cause: the grid uses `sm:grid-cols-2` which kicks in at 640px, so on tablet (≥768px but narrow card width) two columns squeeze each cell's label+value into the same row with no wrap protection. Long values like "Higher is Better" and "Manual Entry" collide with their labels.

## Fix (UI-only, presentation layer)

Edit `src/components/review/KpiMetricsSection.tsx`:

1. **Switch grid to single-column until enough width is available**: use `grid-cols-1 md:grid-cols-2` (drop the `sm:`). On tablet the card sits in a sidebar/column where 2-col is too tight.
2. **Stack label above value inside each cell** instead of `justify-between` row: use a vertical flex (`flex flex-col gap-0.5`). This guarantees the value never collides with the label regardless of width.
3. **Allow value wrapping**: remove `truncate` + fixed `max-w-[80px]` on Source; use `break-words` and `whitespace-normal` so "Manual Entry" / "Higher is Better" wrap cleanly.
4. **Keep Target unit inline**: render `{target} {uom}` on one line with `whitespace-nowrap` so `100 %` doesn't split.
5. **Tighten the Rating Scale rows** so R-values + threshold text wrap rather than overflow on narrow widths (`flex-wrap`, remove `truncate`).

No business logic, no schema, no policy change. Pure presentation.

## Risk & Impact
- Data Impact: none
- Workflow Impact: none
- UI/UX: improves tablet + narrow desktop card readability; desktop ≥1024px unchanged visually since md:grid-cols-2 still applies
- Regression Risk: low — single component, no shared tokens changed
- Mitigation: verify at 768px, 1024px, 1493px viewports after change