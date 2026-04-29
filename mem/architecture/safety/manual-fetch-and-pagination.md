---
name: Safety Manual-Fetch & Pagination
description: Filters-first, click-to-load, paginated tables across every Safety list/query surface — sanctioned primitives only
type: constraint
---
# Safety Manual-Fetch & Pagination (POLICY §113 / ADR-050)

Every `/safety/*` list/query screen MUST follow this contract. New Safety pages that violate it must be rejected at review.

## Rules
1. **No auto-fetch on mount** for list/query screens. Page renders the filter bar + an "awaiting search" empty state. The first query fires only on **Search** click or Enter inside a filter input.
2. **Server-side pagination is mandatory.** Default page size 25, options {25, 50, 100}. Use `.range(from, to)` with `count: 'exact'`.
3. **Cache key = submitted filters + page + pageSize.** Typing does not refetch. Mutations re-run the *last submitted* query unchanged.
4. **Exempt:** detail pages (`/:id`), single-aggregate dashboard tiles (SafetyHome tiles, SafetyAnalytics KPI cards), New/Edit forms. Tables embedded inside dashboards are NOT exempt.
5. **Naming:** primary = `Search` (filter screens) or `Load` (parameterless). Secondary = `Reset`. No other verbs.

## Sanctioned primitives (the only legal way to build a Safety list)
- `useManualQuery<T>(queryKey, fetcher, { pageSize })` → `src/hooks/useManualQuery.ts`
- `<SafetyFilterBar onSubmit={...}>` → `src/components/safety/SafetyFilterBar.tsx`
- `<SafetyDataTable rows total page pageSize onPageChange onPageSizeChange ...>` → `src/components/safety/SafetyDataTable.tsx`
- `<SafetyEmptyState variant="awaiting-search" | "no-results">` → `src/components/safety/SafetyEmptyState.tsx`

## Forbidden
- `useQuery({ enabled: true })` returning a list on a Safety list page.
- `.select('*')` without `.range()` on Safety list queries.
- Client-side filtering / sorting of an unbounded result set.
- Hardcoded page-size constants outside the primitives.

## Tests
- `src/test/safetyManualFetch.test.tsx` — asserts no fetch on mount, Search triggers exactly one ranged query, pagination advances `range`.
- `src/test/safetyPagination.test.ts` — pure logic for `useManualQuery` (range math, page bounds, pageSize change resets to page 1).

## Related
- POLICY.md §113
- docs/adr/ADR-050.md
