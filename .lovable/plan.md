

## Add Validation Guards to Employee Import

### What You Asked For
1. If an uploaded employee code already exists in the system, show an error (don't silently overwrite)
2. If dept, BU, division, or designation doesn't exist in the system, block the import row with a clear error message instead of silently creating or ignoring them

### Current State
- Employee import **silently updates** existing employees when their code matches — no warning
- `department` is resolved to `department_id` but if not found, it just sets `null` — no error
- `division`, `businessUnit`, `designation` values from the import file are **completely ignored** during processing (never validated or stored properly)
- There is a `designations` table in the system (managed under Organization Structure)

### Implementation

#### 1. Add Pre-Import Validation (ImportData.tsx — `handleEmployeeFileUpload`)
After parsing Excel rows, add validation checks:

- **Duplicate employee code check**: For each row, check if `employeeCode` already exists in `profiles`. If yes, add validation error: `"Row X: Employee code 'CODE' already exists in the system"`
- **Department existence check**: If `department` is provided, verify it exists in `departments` list. If not: `"Row X: Department 'NAME' does not exist in the system"`
- **Division existence check**: If `division` is provided, verify it exists in `divisions` list. If not: `"Row X: Division 'NAME' does not exist in the system"`
- **Business Unit existence check**: If `businessUnit` is provided, verify it exists in `businessUnits` list. If not: `"Row X: Business Unit 'NAME' does not exist in the system"`
- **Designation existence check**: If `designation` is provided, verify it exists in `designations` list. If not: `"Row X: Designation 'NAME' does not exist in the system"`

These checks run at file parse time (before the Import button is clicked), so the user sees all errors upfront in the preview.

#### 2. Fetch Designations Data (ImportData.tsx)
Import and use `useDesignations` hook alongside existing `useDivisions`, `useBusinessUnits`, `useDepartments`.

#### 3. Update `handleEmployeeImport` — Resolve Division/BU/Designation
Currently only `department_id` is resolved. Add:
- Resolve `division` → find matching division, link via BU → department hierarchy
- Resolve `businessUnit` → find matching BU
- Resolve `designation` → store the designation string (already stored as text on profiles, but validate it exists in the designations table)

#### 4. Add Toggle for Update vs Create-Only Mode (Optional Enhancement)
Add a checkbox: "Allow updating existing employees". When unchecked (default), duplicate codes are errors. When checked, existing employees get updated (current behavior).

### Files Changed
| File | Action |
|------|--------|
| `src/pages/admin/ImportData.tsx` | Add validation for existing codes, dept/BU/div/designation existence checks; fetch designations; add update-mode toggle |

### Risk Assessment
- **Data**: Zero — validation-only change; no schema modifications
- **Regression**: Existing imports that relied on silent updates will now show errors by default (intentional behavior change per user request)
- **Security**: No change

