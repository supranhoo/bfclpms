## Goal

Add Excel-style per-column filtering to the "View KPIs" drill-in table (`AffectedKpisTable`) so admins can quickly narrow down rows by Employee, Period, Status, Freq, R0–R5, Criteria/UoM, etc. while finalizing standardization merges.

## UX

Each column header gets a small filter icon (funnel) next to the label. Clicking opens a popover with:

- **Search box** — type to filter the value list.
- **Checkbox list** of all distinct values present in the column (across the whole result set, not just the current page), with `(Blanks)` for empty cells. All checked by default.
- **Select all / Clear** links.
- **Apply** + **Clear filter** buttons.

When a column has an active filter, the funnel icon turns primary-colored and a small "Filters: 2" chip appears in the toolbar with a "Clear all" action. The existing outlier amber highlight and "Show scale" toggle stay as-is.

```text
┌ Employee(Employee Code) ▾🔽 │ Period ▾🔽 │ Wt │ Status ▾🔽 │ Freq ▾🔽 │ R0 ▾🔽 │ R1 ▾🔽 │ ... │ Criteria/UoM ▾🔽 ┐
```

Toolbar row above the table:

```text
Showing 1–25 of 66   ·   Filters: 2  [Clear all]          [Show scale ●━]
```

Pagination updates against the filtered set (e.g. "Showing 1–25 of 18 (filtered from 66)").

## Scope of columns getting filters

Employee, Period (`Mon YYYY`), Status, Freq, R0, R1, R2, R3, R4, R5, Criteria/UoM. `Wt` stays unfiltered (numeric, low value).

## Technical approach (single file, UI-only)

File: `src/components/admin/kpi-standardization/AffectedKpisTable.tsx`

1. **Fetch-all once per signature** — current code paginates via Supabase `.range()` on every page. To make filters operate over the full set (not just one page), switch to a single fetch of all rows for `(category_id, kra_name, kpi_name [, period/year])` using the existing `fetchAll` helper (`src/lib/fetchAll.ts`) capped at e.g. 5,000 rows with a guard message if exceeded. Page slicing then happens client-side on the filtered array.
  - Rationale: signature-scoped result sets are small (tens to low hundreds in practice for one KPI). Confirms with existing Build Registry usage.
2. **Filter state** — `const [filters, setFilters] = useState<Record<ColKey, Set<string>>>({})`. A column with no entry = "all values pass". `(Blanks)` represented by the sentinel `'__BLANK__'`.
3. **Distinct value computation** — `useMemo` over the full fetched array; for each filterable key, collect normalized distinct values (case-insensitive, trim) with original display casing preserved (first-seen).
4. **Filtered rows** — `useMemo` applies all active filters with AND semantics across columns, OR within a column's checked set.
5. **Header popover** — new tiny inline component `ColumnFilterPopover` (kept in same file, ~60 lines) using existing shadcn `Popover`, `Command`/`CommandInput`, `Checkbox`, `Button`. Funnel icon from `lucide-react` (`Filter` / `FilterX`).
6. **Outlier highlighting** — keep `pageModes` / `isOutlier` but recompute against the **currently visible page of the filtered set**, so highlighting stays meaningful after filtering.
7. **Persistence** — filters reset when `categoryId/kraName/kpiName/reviewPeriod/reviewYear` change. Not persisted to localStorage (transient drill-in).
8. **Tests** — extend `src/lib/scannerCellHighlight.test.ts` is unrelated. Add a new small pure helper `applyColumnFilters(rows, filters)` in `src/lib/affectedKpisFilters.ts` with unit tests covering: no filters → all rows; single-value filter; multi-value OR; multi-column AND; `(Blanks)` sentinel matches null/empty/whitespace; case-insensitive match.

## Out of scope

- No backend / RPC changes.
- No changes to merge/scan logic, `scan_kpi_duplicate_groups`, or `BuildRegistryTab` outside of how `AffectedKpisTable` is consumed (props unchanged).
- No CSV export (can be a follow-up if asked).
- No sort UI (can be a follow-up; Excel-style sort + filter together is a larger lift).

## Risk & Impact

- **Data**: read-only, no schema or RLS change.
- **Workflow**: none — affects only the View KPIs drill-in inside KPI Standardization → Build Registry.
- **UI/UX**: header height grows ~4px to fit the funnel icon; horizontal scroll behavior preserved (sticky Employee column kept).
- **Regression**: low. Switching from server-paginated to fetch-all is the main risk; mitigated by the 5,000-row cap with a visible warning row instructing the user to scope by period if exceeded.
- **Perf**: filtering 5k × ~11 cols in `useMemo` is sub-ms; fine.

## Deliverables

1. Updated `AffectedKpisTable.tsx` with per-column filter popovers and full-set fetch + client-side paging.
2. New `src/lib/affectedKpisFilters.ts` + matching `.test.ts`.
3. Updated `.lovable/plan.md` notes section.