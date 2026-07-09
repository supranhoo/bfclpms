# Fix — Pagination on Phased Rollout tables

## Scope
`src/components/annual-review/PilotAccessCard.tsx` renders two unpaginated tables that violate POLICY §13 (Data Tables & Pagination):

1. **Users in current phase** — renders every row from `targetedProfilesQ.data` (currently 29, unbounded as rollout grows).
2. **Preview matches** — renders every row from `preview` (up to the 500-row profile fetch cap).

Both are pure client-side lists over already-fetched arrays, so client-side pagination is the correct fit (no network changes).

## Changes

1. Add page-size + page-index state per table (default page size **10**, options 10/25/50).
2. Slice the arrays via `pagedSlice(rows, page, pageSize)` from `src/components/admin/kpi-standardization/RegistryPager` (already-tested helper — see `src/test/registryPager.test.tsx`) and render a compact footer with:
   - "Showing X–Y of N"
   - Prev / Next buttons (disabled at bounds)
   - Page-size `Select`
3. Reset `page` to 1 when the underlying array length changes (audience mutation, new preview run, filter change).
4. "Select all" on preview retains its current semantics (selects **all** eligible-to-add across all pages, not just the visible page) — clarified via a small helper label "(all pages)".
5. No changes to data-fetching, RLS, schemas, or business logic.

## Tests
Extend `src/test/registryPager.test.tsx` is already covered. Add a lightweight component test `src/test/annualReview/phasedRolloutPagination.test.tsx` asserting:
- With 30 audience rows and pageSize 10, only 10 `<tr>` render on page 1.
- Clicking Next advances to rows 11–20.
- Changing pageSize to 25 collapses to 2 pages.

## Docs / Policy
- `DOCUMENTATION.md` — v2.66.98 entry: pagination added to Phased Rollout tables.
- `POLICY.md` — cross-reference under §13 that the Phased Rollout surface is compliant; no new clause needed.

## Risk & Impact
- **Data:** None.
- **Workflow:** None — same rows, just paged.
- **UI:** Table height stabilises; adds a footer row with pager controls. Responsive (footer wraps on mobile).
- **Regression:** Low. Isolated to one file + one new test.
- **Rollback:** Revert the single component file.
