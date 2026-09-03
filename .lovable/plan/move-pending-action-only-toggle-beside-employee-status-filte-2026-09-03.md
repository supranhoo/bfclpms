# Move "Pending action only" toggle beside employee status filter

## Goal
Relocate the Team Reviews "Pending action only" queue toggle so it sits on the same horizontal row as the "Active / Inactive / All" employee status segmented control, instead of appearing below the search/department filters.

## Current state
- The `EmployeeStatusFilter` (Active / Inactive / All) is rendered inside the admin/full-access roster diagnostic row at `src/components/review/EmployeeSelectorGrid.tsx:2251-2257`.
- The "Pending action only" toggle is rendered later at `src/components/review/EmployeeSelectorGrid.tsx:2391-2421`, below `<EmployeeFilters />`.
- The toggle is team-view only and currently wrapped in its own bordered `bg-muted/40` bar with a descriptive subtitle.

## Proposed change
1. **Extract a reusable team-queue toggle component** (optional but recommended to keep `EmployeeSelectorGrid` lean):
   - `src/components/review/TeamQueueToggle.tsx` containing the Switch + Label + subtitle.
   - Props: `actionableCount`, `totalCount`, `checked`, `onCheckedChange`.
2. **Move the toggle into the same row as `EmployeeStatusFilter`**:
   - For `viewLevel === 'team'`, render the toggle immediately to the right of the `EmployeeStatusFilter` inside the existing `flex flex-wrap items-center justify-between gap-2` container.
   - Keep the existing subtitle text, but reduce visual weight so the row does not feel crowded.
3. **Remove the old toggle block** at `src/components/review/EmployeeSelectorGrid.tsx:2391-2421`.
4. **Preserve behavior**:
   - Default remains "Pending action only" ON (`queue=actionable`).
   - URL state (`?queue=...`) unchanged.
   - `Clear All` still resets to actionable.
   - Tile counters and grid filtering logic untouched.

## UI Changes (explicit)
- **What:** The "Pending action only" switch moves from a separate bar below the filters to the right of the "Active / Inactive / All" segmented control.
- **Where:** `/dashboard?view=team` (Team Reviews), in the filter-standard row that already holds the employee status control.
- **Interaction:** Same toggle interaction; state still persists via `?queue=`; works simultaneously with status, search, department, designation, and grade filters.
- **Responsiveness:** On desktop both controls sit in one row. On mobile (`<640px`) the status control collapses to a Select; the queue toggle wraps to a second line within the same flex container if needed, maintaining touch targets.

## Risk & Impact Report
- **Data impact:** None — pure UI relocation; no schema, RLS, or query change.
- **Workflow impact:** None — filter semantics unchanged.
- **UI/UX impact:** Cleaner filter bar; the toggle is now grouped with other employee-scoping controls.
- **Regression risk:** Very low. Risk is limited to layout shifts or the toggle not rendering in the audit/management views (mitigated by keeping the `viewLevel === 'team'` guard).
- **Scalability:** No change.
- **Mitigation:** Verify the toggle still appears only for `viewLevel === 'team'`, that the subtitle count updates correctly, and that `Clear All` resets it.

## Implementation
1. Create `src/components/review/TeamQueueToggle.tsx` (or inline the move if preferred).
2. Update `src/components/review/EmployeeSelectorGrid.tsx`:
   - Insert the toggle next to `EmployeeStatusFilter` in the diagnostic/status row.
   - Delete the old standalone toggle block below `<EmployeeFilters />`.
   - Adjust wrapper classes for consistent spacing.
3. Run typecheck + relevant unit tests (`actionableQueueFilter.test.ts`).
4. Update `roadmap.md` to mark ADR-348 UI polish complete.

## Tests
- Existing `src/tests/actionableQueueFilter.test.ts` covers filter logic; no new logic tests required.
- Visual verification via Playwright or preview: confirm toggle is beside status control, subtitle renders, and switching still filters the grid.

## Rollback
Revert the single component edit and restore the old toggle block if needed.
