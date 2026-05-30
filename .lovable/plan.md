# Continue Phase 1 — Employee Category & Employment Status

Resuming from where implementation halted. DB migration, hooks, Organization tabs, and UserManagement state/mutations are already done. Remaining work below.

## Assumptions
- Decisions from open questions (unanswered) → use defaults:
  1. Employment Status = **global** (already migrated this way)
  2. Profile page visibility = **yes**, show read-only on employee Profile → Organization card
  3. Import unknown values = **strict error** (no auto-create)
- Field names on `profiles`: `employee_category` (text), `employment_status` (text) — store names, matching `pms_grade` pattern.

## Risk & Impact
- **Data**: Additive only. Nullable text columns. No effect on scoring/workflow.
- **Workflow**: None — purely descriptive attributes.
- **UI**: Two new selects in Add/Edit User dialog; two new columns in import template + employee export; one read-only block on Profile.
- **Regression**: Low. Edge function `create-employee` must accept new optional fields (back-compat: undefined ignored).
- **Rollback**: Drop two columns + two master tables.
- **Scalability**: Master tables small (<100 rows typical); selects use existing `OrgFilterCombobox`.

## Steps

1. **UserManagement Add/Edit dialog UI**
   - Add two `OrgFilterCombobox` (or Select) fields below PMS Grade: "Employee Category" (company-scoped via `useEmployeeCategories(companyId)`) and "Employment Status" (`useEmploymentStatuses()`).
   - Both optional, clearable. Wire to existing state already added.
   - Verify: Add user → set both → save → reload → values persist.

2. **Edge function `create-employee` pass-through**
   - Accept `employee_category?: string | null`, `employment_status?: string | null` in payload schema.
   - Insert into `profiles` row.
   - Validate (if provided) value exists in master table; reject with 400 otherwise.
   - Deploy.

3. **Import Data — Employees template**
   - `EmployeeImportRowSchema`: add `employeeCategory` and `employmentStatus` optional string fields.
   - Header aliases: `Employee Category`, `employee_category`, `category`; `Employment Status`, `employment_status`, `status`.
   - Resolver: case-insensitive lookup against master tables (scoped by target company for category). Unknown → row error `"Unknown employee category: 'X'"`.
   - Update sample CSV/XLSX template generator.
   - Verify: import 3 rows (1 valid, 1 unknown category, 1 blank) → expected outcomes.

4. **Export Employees**
   - Locate exporter; if two exist, consolidate to single source (per prior plan).
   - Append columns `Employee Category`, `Employment Status` using profile text values.
   - Header casing matches importer aliases exactly for round-trip.
   - Round-trip test: export → re-import → zero diffs on new fields.

5. **Profile page (Organization card)**
   - Add two read-only rows: "Employee Category", "Employment Status". Hide row if value null.

6. **Docs & memory**
   - `DOCUMENTATION.md`: new section "Employee Category & Employment Status" — schema, master CRUD location, import/export header aliases, edge function contract.
   - `POLICY.md`: declare both as descriptive-only attributes (no scoring impact); admin governs master rows; strict-validation on import.
   - `mem://features/admin/employee-category-and-status` — feature memory with key invariants.
   - Version history entry.

7. **Tests**
   - Unit: schema parser (valid / unknown / blank for both fields).
   - Unit: edge function validation (rejects unknown master value).
   - Unit: export round-trip helper.

## UI Changes
- **User Management dialog**: 2 new selects under "PMS Grade" row, same column width, optional, with "— None —" clear option.
- **Import wizard**: column mapper auto-detects 2 new headers; preview table shows them; error column highlights unknown values.
- **Export button**: produces file with 2 extra columns at the end (after PMS Grade).
- **Profile → Organization card**: 2 new label/value rows (read-only) conditionally rendered.
- Responsive: existing grid handles new fields; verified on 929px viewport.

## Not Applicable
- No new RLS (reuses existing `profiles` policies; master tables already have RLS from migration).
- No workflow/scoring changes.

Proceed?