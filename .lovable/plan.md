# Add 3 filters to Bulk Scoring: Designation, Grade, Reporting Manager

## Assumptions
- Same UX pattern as existing multi-select filters (`MultiSelectFilter` + URL persistence).
- Filter values come from the **profiles** table (`designation`, `pms_grade`, `reporting_manager_id` / name).
- The current `bulk_review_snapshot` rows expose `employee_id` / `employee_name` / `employee_code` but **not** designation / grade / manager. We will fetch those attributes once for the loaded snapshot's employees and join client-side — no RPC signature change, no DB migration.

## Risk & Impact
- **Data**: read-only profiles fetch (already RLS-protected). No schema change.
- **Workflow**: none — purely a view-side filter on already-loaded snapshot.
- **UI/UX**: filter bar gains 3 more chips. On 1297px viewport the bar already wraps; new chips wrap to a 2nd line — acceptable, matches existing wrap behavior.
- **Regression**: low. Filtering is composed with the existing client-side filter chain in `loadedRows` useMemo. Snapshot fetch / RPC untouched.
- **Scalability**: profile lookup is bounded by `distinct employee_ids` in the snapshot (≤ scope cap, currently 27 emp in user's screenshot). Single batched query.
- **Mitigation**: reuse `MultiSelectFilter`, `bulkUrlState` helpers, and existing reset-on-stale pattern.

## Plan

1. **Profile attribute hook** — new `useBulkEmployeeAttrs(employeeIds: string[])` in `src/hooks/useBulkReview.ts`. Single `profiles` select returning `{ id, designation, pms_grade, reporting_manager_id, reporting_manager:profiles!reporting_manager_id(full_name) }` for the snapshot's employees. Enabled only after snapshot loads.

2. **URL state** — extend `bulkUrlState.ts` keys: `desigs`, `grades`, `mgrs` (CSV of values / manager UUIDs). Add to encode/decode + tests.

3. **Dashboard state** — in `BulkReviewDashboard.tsx`:
   - `designations: string[]`, `grades: string[]`, `managerIds: string[]` state hydrated from URL, persisted via existing effect.
   - Build option lists from the snapshot's employee set (so the dropdowns only show values present in the current scope), sorted, deduped, with "(blank)" sentinel for nulls (consistent with KRA handling).
   - Extend `loadedRows` useMemo: after KRA / search / hideEmpty, filter rows whose `employee_id` is in the allowed set computed from the 3 new filters.
   - Add the 3 filters to `activeFilterCount`.
   - Add a reset-on-scope-change effect (clear stale selections when their value no longer appears in the snapshot — mirrors existing KRA reset behavior, but per-value pruning, not full clear, to keep URL deep-links working).

4. **UI** — append 3 `MultiSelectFilter` chips after the existing "All KRAs" chip, in this order: Designation → Grade → Reporting Manager. Same icon language: `IdCard`, `Award`, `UserCog` (lucide).

5. **Tests**
   - `bulkUrlState.test.ts`: encode/decode round-trip for `desigs/grades/mgrs`.
   - New `bulkEmployeeFilter.test.ts`: pure helper that takes `(rows, allowedEmpIds)` and returns filtered rows; covers empty selections = pass-through, multi-value union, blank sentinel.

6. **Docs / Memory**
   - `DOCUMENTATION.md`: add filters to Bulk Review section.
   - `mem://features/review/bulk-review-dashboard`: append filter list + client-side join rationale.

## UI Changes
- **Where**: Bulk Review top filter bar, second row.
- **What**: 3 new dropdown chips with checkbox + search + Select-all/Clear, label format "All Designations / All Grades / All Managers" when empty, count badge when ≥1 selected.
- **Interaction**: independent multi-select; combine as AND across filter types, OR within a filter.
- **Responsiveness**: chips wrap naturally as today (`flex-wrap`).

## Out of Scope
- Modifying `bulk_review_snapshot` RPC to embed these fields server-side (can be a later optimization if profile-join cost grows).
- Server-side push-down of these filters into the scope preview / cap calculation.
- Adding these as visible columns in the grid (filters only, per request).

## Files
- edit `src/hooks/useBulkReview.ts` (+ `useBulkEmployeeAttrs`)
- edit `src/pages/review/BulkReviewDashboard.tsx`
- edit `src/lib/bulkUrlState.ts` + `bulkUrlState.test.ts`
- new `src/lib/bulkEmployeeFilter.ts` + `bulkEmployeeFilter.test.ts`
- edit `DOCUMENTATION.md`, `mem/features/review/bulk-review-dashboard`
