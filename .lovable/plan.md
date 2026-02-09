

# Fix: Allow Independent / Non-Connected Rows in Org Structure Import

## Problem
The current import requires every row to be fully connected across columns. For example, if you put a Business Unit on a row, you must also fill in the Division column on that same row. This forces you to duplicate parent data across many rows.

You want to enter data like this:

| Division | DivCode | BusinessUnit | BUCode | Department | DeptCode | ... |
|----------|---------|--------------|--------|------------|----------|-----|
| Head Office | HO | | | | | |
| Regional | REG | | | | | |
| | | Technology | TECH | | | |
| | | Sales | SALES | | | |
| | | | | Software Dev | SD | |
| | | | | QA | QA | |

But the system rejects this because "Business Unit requires a Division" on that row.

## Solution

### 1. Remove the strict same-row hierarchy validation

The validation that requires Business Unit rows to also have a Division on the same row will be removed. Instead, the import will:

- Collect all Divisions first (from rows that have a Division)
- For Business Units without a Division on the same row, attempt to match them to an **existing** Division already in the database
- Same logic for Departments (try to match to an existing Business Unit) and Sub-Branches (try to match to an existing Department)

### 2. Add a smarter parent-resolution strategy

For entities that need a parent (BU needs Division, Dept needs BU, Sub-Branch needs Dept):

- **First priority**: Use the parent specified on the same row (current behavior)
- **Second priority**: If there's only ONE parent entity in the database, auto-assign to it
- **Third priority**: If multiple parents exist and none is specified, show a warning (not an error) that these entries will be skipped, and list which ones need a parent

### 3. Change validation from blocking errors to informational warnings

- Rows with standalone Divisions, Designations, PMS Grades, and Levels will always import fine (no parent needed)
- Business Units, Departments, and Sub-Branches without a parent reference will show a **warning** explaining they need a parent, but won't block the rest of the import
- Only truly invalid data (empty names, etc.) will be blocking errors

### 4. Update the template and instructions

- Update the template example to show both connected rows and standalone rows
- Add a note in the card description explaining that columns don't need to be connected across each row

## Files to Change

### `src/components/admin/OrgStructureImport.tsx`
- **Validation logic (lines 190-202)**: Replace strict row-by-row hierarchy checks with a two-pass approach:
  1. First pass: collect all unique entity names from all rows
  2. Second pass: for BUs/Depts/Sub-Branches without a same-row parent, check if a matching parent exists in the collected set OR in the database; warn if unresolvable
- **Import logic (lines 229-237)**: When a BU row has no division on the same row, look up existing divisions in the database to find a match. If only one division exists, auto-assign. If the BU name already exists in the database, treat as update.
- **Template (lines 58-63)**: Update example data to show standalone entries (some rows with only Division, some with only BU, etc.)
- **Card description (line 391)**: Add note: "Each column can be filled independently -- rows don't need to be connected across all columns"

### `DOCUMENTATION.md`
- Update the Org Structure Import section to reflect the new flexible format

## Technical Details

The key change is in how parent resolution works during import:

```
For each Business Unit without a same-row Division:
  1. Check if this BU already exists in DB -> skip (just update code)
  2. Check if exactly ONE division exists (in file + DB) -> auto-assign
  3. Otherwise -> add to warnings list, skip this BU
```

Same pattern for Departments (resolve to BU) and Sub-Branches (resolve to Department).

Standalone entities (Division, Designation, PMS Grade, Level) always import directly since they have no parent dependency.
