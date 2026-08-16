# Console: expand KPIs inline under the selected KRA

Today, selecting a KRA renders a second card at the bottom of the page ("… · KPIs"). The eye has to jump from the clicked row down past the whole KRA list to find the result. Instead, the KPI list should unfold directly beneath the KRA row that was clicked, as a nested panel inside the same list.

## What changes visually

- Clicking a KRA row expands an indented panel immediately below that row; clicking it again (or clicking another KRA) collapses it. Only one KRA is open at a time — same single-selection behaviour as now.
- The KRA row gets a rotating chevron (right to down) instead of the static right chevron, so the row reads as expandable rather than as a link to elsewhere.
- The nested panel is visually subordinate to its parent: a tinted background, a left indent rail aligned under the index chip, and its own slim header row (`KPIs · n`) plus the Employees / Weightage / Avg score column labels.
- KPI rows keep their current content exactly — description, Org-level / Unsplit text / Possible duplicate badges, "Fix text split", the variants disclosure, and the "Open" affordance that opens the detail drawer.
- The separate bottom KPI card is removed.
- If a KRA has no KPI rows, the panel shows a short empty state instead of a blank strip.

```text
02  Customer Portfolio Expansion            1        2      v
    | KPIs · 1              EMPLOYEES  WEIGHTAGE  AVG SCORE
    | 01  No.of new customers added   2     5.00      —   Open >
03  Sales & Dispatch - Sponge Iron ...      1        2      >
```

## Behaviour kept as-is

- Drilldown state, the breadcrumb line above the tabs, and the KPI detail drawer are unchanged; the breadcrumb's KRA entry still collapses back to the KRA level.
- Long KRA lists stay virtualized (above 40 rows); the expanded panel scrolls internally past roughly 8 KPI rows so one large KRA can't push the rest of the list off screen.
- No change to data loading, RPCs, scoring, group actions or the text-split tooling.

## Accessibility

- The KRA row becomes a proper disclosure: `aria-expanded` and `aria-controls` pointing at the panel, keyboard toggling via Enter/Space, focus stays on the row after expanding.
- Rows and the nested KPI rows keep a >=44px touch target; chevron rotation respects reduced motion.

## Technical notes

- `src/components/admin/bu-console/BuConsoleTree.tsx` — render the KPI list inside the KRA `renderRow` output instead of the trailing card; delete the bottom KPI card block.
- `src/components/admin/bu-console/ConsoleMetricRow.tsx` — add optional `expanded` / `expandable` props so the row can render the rotating chevron and the disclosure ARIA attributes.
- The virtualizer already measures rows via `measureElement`, so a variable-height expanded row is handled; the collapsed estimate stays at 56px.
- Regression test extended in `consoleLayout.test.tsx`: an expanded KRA exposes `aria-expanded="true"` and renders its KPI titles adjacent to that row, and no second KPI card exists.
- ADR-278 + DOCUMENTATION.md note recording the inline-disclosure layout.