## Goal

Two UX upgrades to the Bulk Review virtual grid, scoped strictly to frontend/presentation. No RPC, schema, or workflow changes.

1. **Horizontal Select / Deselect handles** — per-row toggle that selects every cell of one employee×KPI row (today a row already maps to one selectable `submission_id`, so this becomes a clearer per-employee and per-KPI bulk selector via header chips, plus a fast keyboard-style "select all in this group" affordance).
2. **"Show employees for this KPI only" filter** — clicking a KPI name (or a focus icon next to it) collapses the grid to that single KPI across all visible employees, with a removable chip to clear.

Both actions share a single batch on sign-off (current contract preserved).

---

## Risk & Impact Report

- **Data Impact:** None. Pure client state.
- **Workflow Impact:** None. Uses existing `bulk_write_stage_scores` + `bulk_approve_submissions`.
- **UI/UX:** Adds (a) a small "select column" header dropdown ("All visible / None / Invert"), (b) a focus icon on the KPI cell, (c) an active-filter chip strip above the grid alongside existing filters.
- **Regression Risk:** Low. Selection set already keyed by `submission_id`; new toggles call existing setters. KPI filter is an additional predicate before rows reach `BulkReviewVirtualGrid`.
- **Scalability:** No new queries. Filter narrows the in-memory rows, reducing virtualiser work.
- **Mitigation:** Unit tests for the new selection helper + KPI filter predicate; URL-state for the KPI focus so deep links + back button work.

---

## Plan

### A. Horizontal select handles
1. Replace the header checkbox in `BulkReviewVirtualGrid` with a small `DropdownMenu` containing:
   - **Select all visible** (current behaviour of `onToggleAll`)
   - **Deselect all**
   - **Invert selection**
   - **Select all for this KPI** — only enabled when KPI filter is active
2. Add a row-hover affordance: hovering the KPI cell reveals a "Select all rows of this KPI" mini-button. Clicking selects every visible row sharing the same `kpi_id` (still single batch — answer 3).
3. Same affordance on the employee cell ("Select all rows of this employee"), gated behind a feature flag prop so we can ship KPI-first if preferred.

### B. "Show only this KPI" filter
1. Add a `focus` icon (`Crosshair` from lucide) next to the KPI name in the grid row; clicking it sets a new `kpiFocusId` filter.
2. `kpiFocusId` is persisted in the URL via `useUrlFilterStateNullable('kpi')` so it survives reloads and matches the project's deep-link convention.
3. Filtering is applied alongside existing filters (search, designation, grade, manager, KRA). A removable chip "KPI: <name> ✕" appears in the active-filters row.
4. When `kpiFocusId` is set, the KRA column collapses to a single label and the grid header shows a small badge with the cell count for that KPI.

### C. Shared bulk action contract
- Bulk Approve / Sign-off behaviour is unchanged: one batch reason + optional attachments applied to every selected row (matches v2.66.13.6 RPC).

---

## Files to change

- `src/pages/review/BulkReviewDashboard.tsx` — add `kpiFocusId` URL-bound state, pass to grid, add chip, pass selection helpers.
- `src/components/review/BulkReviewVirtualGrid.tsx` — header dropdown, hover focus icon, hover "select all of this KPI" button, accept `onFocusKpi` + `onSelectAllForKpi` props.
- `src/lib/bulkRowSelection.ts` (new) — pure helpers: `selectAllByKpi`, `invertSelection`, `selectAllByEmployee`. Easier to unit-test than inline grid logic.
- `src/lib/bulkRowSelection.test.ts` (new) — covers KPI/employee selectors, invert, and "select all visible".
- `src/test/bulkReviewKpiFilter.test.ts` (new) — asserts `kpiFocusId` narrows rows correctly and clears via chip.
- `DOCUMENTATION.md` — v2.66.13.7 entry.
- `POLICY.md` — §111.7.b note that bulk-action contract is unchanged; new affordances are presentation-only.
- `mem/features/review/bulk-review-dashboard` — append entry.

---

## UI Change Summary

- **Where:** `/dashboard?view=team` Bulk Review grid.
- **What changes visually:**
  - Header checkbox becomes a checkbox + chevron dropdown.
  - Hovering a row reveals a faint crosshair icon on the KPI cell and a "select group" button on both employee and KPI cells.
  - A new chip row above the grid shows active KPI focus with an ✕.
- **Interaction impact:** All existing clicks unchanged. New affordances are additive and keyboard-accessible (`aria-label` on each).
- **Responsiveness:** Hover affordances degrade to always-visible on touch (`@media (hover: none)`), matching existing grid patterns.

---

## Out of scope (explicitly not doing)

- Per-stage cell selection (would require splitting a row into multiple selectable units and a new batching contract).
- Cross-stage batch grouping.
- Server-side filtering — focus filter stays client-side because rows are already in memory after the scope query.
