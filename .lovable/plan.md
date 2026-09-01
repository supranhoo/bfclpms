# Performance Console — find a KRA, a KPI or a person

## What is actually missing (verified)

- `ScopeToolbar` (the filter row) has period, division, business unit, department and manager
  pickers — and no text box. Nothing in the console header searches anything.
- The category strip / KRA / KPI drilldown (`BuConsoleTree`) filters only by category click and the
  "Due this month only" switch. With 49 categories, 393 KRAs and 814 KPIs, reaching one KPI means
  scrolling.
- The people list inside a KPI (`KpiPeopleStrip`) is paginated 200 at a time with prev/next arrows
  and no way to find one employee. The RPC behind it, `bu_console_kpi_detail`, takes no search
  argument (its sibling `bu_console_scoring_profiles_page` already takes `p_search`, so the pattern
  exists).

So all three searches are feasible; two are pure client work, one needs a small additive RPC change.

## What gets built

### 1. One search box in the console toolbar (KRA + KPI + category)

A single input, "Search category, KRA or KPI…", placed in the scope toolbar next to the filters
(and inside the filter sheet on mobile). Debounced 300 ms per the lean-load policy.

Because the whole tree for the selected scope is already in memory, this filters client-side —
no reload, instant results:

- A category stays in the strip when its name matches, or when any of its KRAs/KPIs match; its
  badge count switches to the number of matching KPIs.
- Inside the open category, only matching KRAs are listed; a KRA whose own name matches keeps all
  its KPIs, a KRA that matched only through a KPI shows just the matching KPIs.
- The first matching KRA auto-expands so a hit is visible without a second click.
- Matched text is highlighted in the row title.
- Empty state: "No KRA or KPI matches «term» in July 2026" with a "Clear search" button.
- The search term joins the toolbar summary chip and the active-filter count, and combines with the
  "Due this month only" switch (both applied, search last).

Matching is accent/case-insensitive on category name, KRA name, KPI title and legacy KPI name.

### 2. Employee search inside a KPI

A small "Find person" input in the KPI people strip header, next to the pager. Searching by name or
employee code narrows the list across *all* pages, not just the page on screen — so the search is
executed server-side and resets to page 1.

`bu_console_kpi_detail` gains an optional `p_search` argument that filters the employee set by name
or employee code before paging, exactly the way `bu_console_scoring_profiles_page` already does.
The reported "x of y people" count reflects the search.

Group actions (group value entry, group approve, tune) keep operating on the **whole** KPI group,
not the filtered view; when a search is active the action bar states that explicitly so nobody
mistakes a filtered list for a filtered write.

### 3. Jump to an employee (global)

The same toolbar box also answers "where is this person?": typing a name or employee code shows a
second result group, "People", listing matching employees in the loaded scope. Selecting one opens
the existing employee scorecard drawer for the console's period — the drawer and its RPC already
exist, it simply has no entry point today.

## What does not change

- No change to scoring, workflow, permissions or writes. Search is a read-side narrowing only.
- No change to the `bu_console_tree` payload; the same data is filtered in the browser.
- Existing filters, the due-only switch and pagination keep their current behaviour.

## Risk and impact

- **Data:** none. One additive, defaulted RPC parameter; no schema change.
- **Workflow:** none. Group writes remain scope-wide and say so.
- **UI:** one input added to the toolbar (and to the filter sheet on small screens), one input in the
  KPI people header. Toolbar height unchanged; the collapsed sticky summary gains the search term.
- **Regression risk:** low-medium, concentrated in the tree filter. Mitigated by putting the filter
  in a pure, unit-tested module rather than inside the component.
- **Scalability:** client filter runs over ~814 KPIs — trivial, and debounced. Employee search is
  server-side and paginated, so no unbounded read.
- **Rollback:** delete the search state and the module; revert the RPC to its previous body.

## Technical notes

- New `src/components/admin/bu-console/consoleSearch.ts` — `normalise()`, `filterConsoleTree(tree,
  term)` returning the pruned tree plus match counts and the KRA to auto-expand, and
  `matchEmployee(row, term)`. Unit tests: category-only match, KRA-only, KPI-only, legacy-name
  match, no match, empty term passthrough, interaction with `dueOnly`.
- `ScopeToolbar.tsx` — new optional `search` / `onSearchChange` props, rendered desktop-inline and
  inside the sheet; `useDebouncedValue(value, 300)`.
- `BuConsole.tsx` — owns `searchInput` state, passes the debounced value to the tree and to the
  people-jump list; clears drill selection when the current selection stops matching.
- `BuConsoleTree.tsx` — consumes the filtered tree, highlights matches, empty state.
- `KpiPeopleStrip.tsx` + `useBuConsole.ts` (`KpiDetailArgs.search`) — pass `p_search`, reset page on
  change, badge the filtered count.
- Migration: `CREATE OR REPLACE FUNCTION bu_console_kpi_detail(... , p_search text DEFAULT NULL)` —
  parameter appended so existing calls keep working.
- Docs: ADR-336 + `POLICY §CONSOLE-SEARCH` (search never widens a write scope) and a
  DOCUMENTATION.md version entry in the same change.
