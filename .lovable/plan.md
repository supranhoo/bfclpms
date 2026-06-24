## Goal
Add **PMS Grade** and **Level** filters to the Annual Review Admin → Progress tab filter row, next to the existing BU / Department / Manager filters. Server-side filtering, master-data driven, included in the export "Filters" sheet.

## Risk & Impact
- **Data**: Read-only. No schema change. Uses existing `profiles.pms_grade` / `profiles.level` columns and existing `usePmsGrades` / `useLevels` master-data hooks.
- **Workflow**: None. Pure filter narrowing.
- **UI**: Two extra `<Select>` controls in the same filter row. Row already wraps; no layout regression expected on standard widths.
- **Regression**: Low. `listInstancesPaginated` gets two optional args; the existing org-id resolver gains two more optional predicates and stays `null` when no org filter is active.
- **Scalability**: Grade/Level resolve through the same paged (1000/batch) profile scan already used for dept/BU — bounded and unchanged in complexity.
- **Mitigation**: Unit tests for the resolver (grade-only, level-only, grade+level, grade+dept intersection); update existing admin filter tests; export sheet assertion includes the two new keys.

## UI changes
Location: `src/pages/annual-review/AnnualReviewAdmin.tsx`, Progress tab filter row (between "All departments" and "All managers"):
- Add `Select` "All PMS grades" populated from `usePmsGrades()` (option value = grade `name`, since `profiles.pms_grade` is the name string in the existing code path at line 1018).
- Add `Select` "All levels" populated from `useLevels()` (option value = level `name`).
- Both clear via the existing "all" sentinel pattern.
- Selected values are echoed into the export's `filtersApplied` map (`pms_grade`, `level`) so the exported "Filters" sheet records them.
- No change to bulk actions, table columns, or row rendering.

## Technical plan
1. `src/services/annualReview/annualReviewService.ts`
   - Extend `ListInstancesPaginatedArgs` with `pmsGrade?: string` and `level?: string`.
   - Extend `resolveEmployeeIdsForOrgFilters` signature + early-return guard to also activate when `pmsGrade` or `level` is set. After resolving `deptIds` (existing logic), add `.eq('pms_grade', args.pmsGrade)` / `.eq('level', args.level)` to the paged `profiles` query. Keep `null` return when no filter is active.
   - Pass the new args through `listInstancesPaginated` (no other call sites need changes; the function is the single entry used by the admin grid).
2. `src/pages/annual-review/AnnualReviewAdmin.tsx`
   - Add `pmsGrade` / `level` `useState` strings + `usePmsGrades()` / `useLevels()` from `@/hooks/useOrganization`.
   - Add two `Select` controls mirroring the BU/department pattern (same `w-48 h-10` sizing, same "all" sentinel).
   - Include both in the `useAnnualReviewInstances` args and in the `filtersApplied` object passed to the workbook exporter.
   - Add them to `anyOrgFilter` so the "any filter active" UX (clear button etc., if present) stays consistent.
3. Tests
   - `src/services/annualReview/*.test.ts`: new cases for `resolveEmployeeIdsForOrgFilters` with grade-only, level-only, grade+dept intersection (mocked supabase per existing patterns).
   - Extend the admin export test (if present) to assert the two new keys appear in the `Filters` sheet rows.
4. Docs
   - `DOCUMENTATION.md`: bump patch version, note new admin filters and the resolver extension.
   - `POLICY.md`: under Annual Review admin filters, add Grade/Level as allowed narrowing dimensions (read-only, no effect on scoring).

## Rollback
Pure additive: revert the two files + tests + docs. No DB migration to undo.

## Out of scope
- Persisting filter selections across sessions.
- Adding Grade/Level columns to the table (filter only, per request).
- Analytics / Calibration tabs (separate query paths; can mirror later if asked).