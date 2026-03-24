

## Add Division Filter Dropdown to Edit User Dialog

### Problem
The Edit User dialog has Department, Designation, PMS Grade, and Reporting Manager — but no Division selector. Since the org hierarchy is Division → BU → Department, adding a Division dropdown helps admin quickly narrow departments.

### Approach
Division is NOT stored on the profile (it's derived from dept → BU → division). The Division dropdown acts as a **cascading filter** for the Department dropdown — selecting a division filters departments to only those under that division's business units.

### Changes — `src/pages/admin/UserManagement.tsx`

1. **Import** `useDivisions` and `useBusinessUnits` from `useOrganization`

2. **Add state**: `editDivisionId` (string, default `''`) — UI-only filter, not saved to DB

3. **Initialize on edit**: When opening the edit dialog, derive the division from the selected user's department:
   - Find department → `business_unit_id` → find BU → `division_id` → set `editDivisionId`

4. **Add Division dropdown** in the Organization section grid (before Department), making it a 3-column row:
   - Division select with "All" option
   - Department select (filtered by division if one is selected)
   - Designation select (unchanged)

5. **Filter departments**: When `editDivisionId` is set, filter `departments` to only those whose `business_units.divisions.id` matches

6. **Auto-clear department**: When division changes, if the currently selected department doesn't belong to the new division, reset `editDepartmentId` to `'none'`

7. **Same for Create User dialog**: Add division filter dropdown there too for consistency

### No database changes needed
Division is derived from the department hierarchy — no new column on profiles.

### Files Modified
- `src/pages/admin/UserManagement.tsx` — add Division dropdown as cascading filter for Department in both Edit and Create dialogs

