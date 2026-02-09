

# Separate Upload Options for Each Entity Type

## Problem
When your file has many Divisions AND many Business Units without same-row connections, the system cannot auto-assign parents because multiple candidates exist. You need the ability to upload each entity type independently, selecting a parent when needed.

## Solution

Add a **selector/mode** at the top of the import that lets you choose what you're uploading:

- **Full Structure** (current behavior) -- upload everything at once with connected rows
- **Divisions Only** -- just Division + DivisionCode columns, no parent needed
- **Business Units Only** -- BU + BUCode columns, plus a dropdown to pick which Division they all belong to
- **Departments Only** -- Dept + DeptCode columns, plus a dropdown to pick which BU they all belong to
- **Sub-Branches Only** -- SubBranch + SubBranchCode, plus a dropdown to pick which Department they all belong to
- **Designations Only** -- no parent needed
- **PMS Grades Only** -- no parent needed
- **Levels Only** -- no parent needed

### How it works

1. User selects an import mode (e.g., "Business Units Only")
2. If the selected type needs a parent (BU needs Division), a **dropdown appears** showing all existing parent entities from the database
3. User picks the parent (e.g., "Head Office" division)
4. User uploads an Excel file with just the entity names and codes
5. All items in the file are created under the selected parent

This means you can:
- First upload all Divisions
- Then upload BUs for "Division A" in one file, BUs for "Division B" in another
- Then upload Departments for each BU separately
- Or still use the "Full Structure" mode for connected rows

## Files to Change

### `src/components/admin/OrgStructureImport.tsx`
- Add an `importMode` state with options: `'full' | 'divisions' | 'businessUnits' | 'departments' | 'subBranches' | 'designations' | 'pmsGrades' | 'levels'`
- Add a Select dropdown at the top to choose import mode
- When mode is `businessUnits`, show a Division selector dropdown (populated from existing DB divisions)
- When mode is `departments`, show a Business Unit selector dropdown
- When mode is `subBranches`, show a Department selector dropdown
- Simplify the template download to only include relevant columns for the selected mode
- Simplify validation: in single-entity mode, no parent resolution warnings needed since the parent is explicitly selected
- Simplify the import handler: in single-entity mode, use the selected parent ID directly instead of resolving from row data

### `DOCUMENTATION.md`
- Update to describe the new import modes

## Technical Details

### New state variables
- `importMode`: which entity type to import
- `selectedParentId`: the chosen parent entity ID (only needed for BU/Dept/Sub-Branch modes)

### Template generation per mode
- "Divisions Only" template: just `name`, `code` columns
- "Business Units Only" template: just `name`, `code` columns (parent selected via dropdown)
- Same pattern for Departments, Sub-Branches, etc.

### Import logic per mode
For single-entity modes, the import skips the multi-pass parent resolution entirely and just:
1. Reads name + code from each row
2. Checks if entity already exists (by name match)
3. Creates new or updates code using the `selectedParentId` as the foreign key

### Parent selector
Uses existing hooks (`useDivisions`, `useBusinessUnits`, `useDepartments`) to populate the dropdown. The dropdown is only shown when the selected import mode requires a parent.
