## Change
In `src/components/review/BulkReviewMatrixGrid.tsx`, increase the sticky first-column width constant `KPI_COL_W` from `260` → `360` px.

That single constant feeds:
- the header cell (`KPI / KRA`)
- KRA category-row label cell
- per-KPI row label cell
- `totalW` (table width)

So bumping it widens all aligned cells consistently.

## Risk & Impact
- Data Impact: None.
- Workflow Impact: None.
- UI: Sticky left column becomes wider; employee columns shift right by 100px. Horizontal scroll already exists, so on the current 1079px viewport users will scroll slightly sooner — acceptable trade-off for readable KRA/KPI text shown in the screenshot.
- Regression Risk: Low — single constant, used in 4 places that already share it.
- Mitigation: No test needed (pure visual constant); no logic change.

## Out of scope
No changes to filters, scoring, drawer, or any other component.

## Tip
For a one-off width tweak like this you can also use **Visual Edits** (bottom-left of the chat box) to adjust it instantly without spending credits.
