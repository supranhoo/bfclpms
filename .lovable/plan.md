

# Add "Rating" Column to Org KPI Scoped Entry Table

## Overview
Add a read-only "Rating" column next to the "Achieved" column in the `OrgKpiScopedEntryTable` component. This column will display the calculated rating (0-5) as a color-coded `RatingBadge` based on the achieved value and the KPI's scoring thresholds. This is an admin-only view since the table itself is only rendered on the admin Org KPI Data Entry page.

## Changes

### File: `src/components/admin/OrgKpiScopedEntryTable.tsx`

1. **Import** `calculateRating` from `@/lib/ratingCalculation` and `RatingBadge` from `@/components/ui/RatingBadge`.

2. **Add props** to pass scoring context into the table:
   - `criteria?: string` (e.g., "Higher is Better" / "Lower is Better")
   - `uomType` and `qualitativeOptions` are already available per-row via `ScopedRow`

3. **Add "Rating" table header** between the "Achieved" and "Remark" columns in the `TableHeader`.

4. **Add "Rating" cell** in the `EmployeeRow` component:
   - Call `calculateRating(row.achievedValue, effectiveTarget, ratingThresholds, criteria, 0, row.uomType, row.qualitativeOptions, effectiveUom)` when `achievedValue` is not null and not N/A.
   - Render the result using `RatingBadge` with `short={true}` for compact display.
   - Show "---" or empty when no value is entered or row is N/A.

5. **Add "Rating" cell** in the `DepartmentRow` component with the same logic (passing thresholds and criteria as additional props).

6. **Update column span** for the department group header row from `colSpan={6}` to `colSpan={7}`.

7. **Pass `criteria` prop** from `OrgKpiEntryCard.tsx` down to `OrgKpiScopedEntryTable`. The card data (`OrgKpiCardData`) will need a `criteria` field, sourced from the KPI's `criteria` column in the database.

### File: `src/components/admin/OrgKpiEntryCard.tsx`

8. **Add `criteria` field** to `OrgKpiCardData` interface.
9. **Pass `criteria` prop** to `OrgKpiScopedEntryTable`.

### File: `src/pages/admin/OrgKpiDataEntry.tsx` (or wherever card data is assembled)

10. **Map `criteria`** from the KPI record into `OrgKpiCardData` when building card data.

## Technical Details

- The `calculateRating` function already handles all UOM types (numeric, binary, tiered, percentage, date).
- The `RatingBadge` component renders the canonical color-coded badge (blue/green/yellow/red gradient) with the score number and label.
- Rating is computed client-side from the current achieved value in real-time, so it updates as the admin types.
- No database changes are required -- this is a display-only enhancement.

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Read-only display, no writes |
| Regression | Very low | Adding a column to an existing table; no existing logic modified |
| Performance | Negligible | `calculateRating` is a lightweight pure function |
