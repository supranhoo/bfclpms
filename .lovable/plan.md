## Change

Currently the Form Mapping page uses a 2-column grid: **Templates in use** (left, short, with an inner `max-h-72` scroll) and **Map a template to an audience** (right, tall). The templates list feels cramped and half of its rows are hidden inside a scroller.

Restructure so Templates in use gets its own full-width row above the mapping/override cards:

```text
┌────────────────────────────────────────────┐
│ Coverage banner                            │
├────────────────────────────────────────────┤
│ Templates in use  (FULL WIDTH, no scroll)  │
│  - 2-col grid of rows on lg+ screens       │
│  - each row: name • employees badge        │
├──────────────────────┬─────────────────────┤
│ Map a template to   │ (space for future)  │
│ an audience          │                     │
├──────────────────────┴─────────────────────┤
│ Employee override panel                    │
├────────────────────────────────────────────┤
│ Unmapped table (if any)                    │
└────────────────────────────────────────────┘
```

Concretely in `src/pages/annual-review/AnnualReviewFormMapping.tsx`:

1. Move `<TemplatesUsagePanel>` out of the `lg:grid-cols-2` wrapper into its own full-width block above it.
2. In `TemplatesUsagePanel`:
   - Drop the `max-h-72 overflow-y-auto` scroll wrapper — render the whole list.
   - Switch the row list to a responsive grid: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6` so long template lists stay readable on wide monitors without becoming an endless single column.
   - Keep every row at `h-10` touch-target height (BFCL standard), preserve the existing `Badge` + border-b separators within each column.
   - Add a small header row: total template count + total employees resolved, so the panel reads as a summary at a glance.
3. Leave `AudienceBuilder` and `EmployeeOverridePanel` untouched aesthetically — `AudienceBuilder` moves into a single-column full-width card (matches the mapping intent per row) but keeps its internal layout, or stays in a `lg:grid-cols-2` shell with only itself on the left so its width matches the previous look. **I'll go with: `AudienceBuilder` sits in a `max-w-3xl` centered card below Templates in use** — it doesn't need to be as wide as the templates summary, and centering keeps the form comfortable on wide screens.

## Risk & impact

- **Data**: none.
- **UI**: only `AnnualReviewFormMapping.tsx` layout changes. No token/color changes, no shadcn variant changes, semantic tokens preserved. Uses the same `Card`, `Badge`, `grid` primitives already in use.
- **Regression**: minimal — no logic touched (coverage query, priority calc, shadow-warning all preserved from previous change).
- **Responsiveness**: rows fall back to single column below `md`, so tablet/mobile still work.

## Rollback

Revert the layout diff in `AnnualReviewFormMapping.tsx`.

## Files touched

- `src/pages/annual-review/AnnualReviewFormMapping.tsx`

## Tests / docs

- No new unit tests (pure layout change; existing coverage-refresh tests still cover behaviour).
- `.lovable/plan.md`: append changelog entry noting the layout change.