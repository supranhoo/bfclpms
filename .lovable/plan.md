

# Detailed Error Report for All Imports

## Overview
Add a comprehensive, downloadable error report that appears after every import (Employee, KPI foreground, and KPI background). Instead of a truncated list of errors in a tiny scrollable box, the user will see a full results summary with the ability to download a detailed Excel report.

## What Changes

### 1. Import Results Summary Card (new component)
A reusable `ImportResultsSummary` component that replaces the current simple error alerts. It will show:

- **Stats row**: Total rows, Successful, Failed, Skipped -- each as a colored stat box
- **Error table**: Scrollable table showing Row Number, Employee Code, Employee Name, Error Message, and Status (failed/skipped)
- **Download button**: "Download Error Report" exports the full error details as an Excel file (.xlsx) with all rows and their status (success/failed + error message)

### 2. Track per-row results (not just errors)
Currently errors are stored as plain strings like `"Failed to import John: ..."`. Change to structured objects:

```text
{
  row: number,
  employeeCode: string,
  employeeName: string,
  status: 'success' | 'failed' | 'skipped',
  message: string
}
```

This applies to:
- Employee import (`handleEmployeeImport`) -- track each batch result with row details
- KPI foreground import (`handleImport`) -- track each row result
- KPI background import -- parse the errors array from the backend and display in the same format

### 3. Employee Import changes
- Replace `employeeErrors: string[]` with `employeeImportResults: ImportRowResult[]`
- After import completes, show the `ImportResultsSummary` component with full results
- Add "Download Error Report" button that generates an Excel file with columns: Row, Employee Code, Name, Status, Error Message

### 4. KPI Import changes (foreground)
- Replace `errors: string[]` with `kpiImportResults: ImportRowResult[]` for post-import results
- Keep the existing validation errors as-is (pre-import)
- Show the same `ImportResultsSummary` after import completes

### 5. KPI Import changes (background)
- Parse `backgroundProgress.errors` into structured format
- Show the `ImportResultsSummary` inside the background progress card when complete

### 6. Excel Error Report Download
When user clicks "Download Error Report":
- Creates an Excel file with sheet "Import Results"
- Columns: Row Number, Employee Code, Employee Name, Status, Error Message
- Only includes failed/skipped rows (with option to include all)
- Filename: `import-errors-{type}-{date}.xlsx`

## Files to Change
1. `src/components/admin/ImportResultsSummary.tsx` -- NEW reusable component
2. `src/pages/admin/ImportData.tsx` -- update state types, track structured results, use new component
3. `DOCUMENTATION.md` -- document the error reporting feature

## Visual Layout

The results card will appear after import completes, replacing the current simple green/red alerts:

```text
+--------------------------------------------------+
|  Import Results                    [Download XLSX] |
|                                                    |
|  [97 Total] [94 Success] [3 Failed] [0 Skipped]  |
|                                                    |
|  Failed Rows:                                      |
|  +------+--------+------------+------------------+ |
|  | Row  | Code   | Name       | Error            | |
|  +------+--------+------------+------------------+ |
|  |  15  | EMP015 | John Doe   | Invalid email    | |
|  |  42  | EMP042 | Jane Smith | Dept not found   | |
|  |  88  | EMP088 | Bob Wilson | Duplicate code   | |
|  +------+--------+------------+------------------+ |
|                                          [Dismiss] |
+--------------------------------------------------+
```

