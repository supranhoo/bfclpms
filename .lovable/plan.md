

## Partial Import with Error Report Download

### What You Asked For
1. Import valid rows even when some rows have errors (don't block the entire import)
2. Provide a downloadable Excel report of errored rows with error details

### Current Problem
The Import button is disabled when `employeeErrors.length > 0`, meaning **any** validation error blocks the entire file. There's no way to import the valid rows and skip the bad ones.

### Implementation

#### 1. Change Validation from Blocking to Per-Row Tagging
Instead of collecting errors into a flat array that disables the button, tag each row with its validation errors. This allows:
- Valid rows → proceed to import
- Invalid rows → skip with error message

**In `handleEmployeeFileUpload`**: Build a `Map<number, string[]>` of row-index → errors. Store this alongside `employeeData`. Update button to show "Import X of Y Employees (Z skipped)".

#### 2. Update `handleEmployeeImport` to Skip Invalid Rows
Before processing each row, check if it has validation errors. If yes, add it to `rowResults` as `skipped` with the error message. Only process clean rows.

#### 3. Add Error Report Download Button
After file upload (before import), if there are errored rows, show a "Download Error Report" button that exports an Excel file with columns: Row Number, Employee Code, Name, Department, Designation, Error Message.

#### 4. Update Button Label
Change from `Import ${employeeData.length} Employees` to show valid vs total count, e.g. "Import 45 of 50 Employees".

### Files Changed
| File | Action |
|------|--------|
| `src/pages/admin/ImportData.tsx` | Change validation to per-row; allow partial import; add error download |

### Risk Assessment
- **Data**: Zero — only valid rows are imported, same logic
- **Regression**: Low — validation is still enforced per row; just no longer all-or-nothing
- **Security**: No change

