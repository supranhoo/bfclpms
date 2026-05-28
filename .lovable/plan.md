## Issue

Employee import currently blocks every existing employee with `Row N: Employee code 'XXXXXX' already exists in the system` and refuses to import (0 of 77). Per documented policy, when an upload contains an existing `employeeCode`, the system should **silently update** that employee's editable org-structure details — not raise a validation error. Only unknown master-data values should be flagged.

A second defect: even when the update path runs, the payload (`ImportData.tsx` lines 1314–1327) **omits `location_id`**, so location is never persisted on existing employees — matching the "not updating" symptom.

A third gap: the validator currently checks only Department / Division / Business Unit / Designation existence. Per policy, **every org master-data field referenced in the sheet** must be validated, and the import must **never create new master-data rows** silently. The complete list (per the Org Structure tabs: Divisions, Business Units, Departments, Sub-Branches, Locations, Designations, PMS Grades, Levels) must be enforced.

## Risk & Impact

- **Data Impact**: Existing-employee rows transition from "skipped" to "updated". Only listed columns are written; blank cells fall back to existing values (no accidental nulling). No schema change. No new master-data rows are ever inserted from this flow.
- **Workflow Impact**: Aligns runtime with the procedure; admin-only screen, no role/permission change.
- **UI Impact**: Removes the `Allow updating existing employees` checkbox and the "already exists" red row error. Validation panel becomes stricter for master-data references (Sub-Branch, Location, PMS Grade, Level now also checked).
- **Regression Risk**: Low for the upsert change (existing branch). Medium for the stricter validator — rows that previously slipped through with an unknown PMS Grade / Level / Location / Sub-Branch will now be flagged. This is the intended hardening.
- **Mitigation**: Keep fallback-to-existing semantics for every updated field; surface every unknown master-data value with a precise row + column message so the admin can fix the sheet or add the master row first.

## Plan

**File:** `src/pages/admin/ImportData.tsx` (primary), plus a small extracted validator + tests.

### 1. Restore silent-update behavior
- Remove the `already exists in the system` push in the parse-time validator (~line 775) and in the checkbox re-validation handler (~line 2026).
- In `processEmployee` (~line 1290), always take the update branch when `existingEmployee` is found. Delete the `if (!allowUpdateExisting) throw ...`. Remove the `allowUpdateExisting` state and its checkbox UI (~lines 408, 2009–2043) along with the dependency in the `useCallback`.

### 2. Persist `location_id` on update
- Lines 1314–1327: resolve `row.location` against the existing `locations` lookup (case-insensitive, same pattern as departments) and include `location_id: resolvedLocationId ?? existingEmployee.location_id`. No other fields change.

### 3. Strict master-data validation (no implicit creation)
Build lookup sets at parse time for **every** Org Structure entity present in the sheet:
- `divisions`, `businessUnits`, `departments`, `subBranches`, `locations`, `designations`, `pmsGrades`, `levels`.

For each row, when the corresponding cell is non-empty, validate existence (case-insensitive) and emit a precise error:
- `Row N: Division 'X' does not exist in master data`
- `Row N: Business Unit 'X' does not exist in master data`
- `Row N: Department 'X' does not exist in master data`
- `Row N: Sub-Branch 'X' does not exist in master data`
- `Row N: Location 'X' does not exist in master data`
- `Row N: Designation 'X' does not exist in master data`
- `Row N: PMS Grade 'X' does not exist in master data`
- `Row N: Level 'X' does not exist in master data`

The import pipeline must **never insert** into `divisions`, `business_units`, `departments`, `sub_branches`, `locations`, `designations`, `pms_grades`, or `levels`. Resolution is strictly lookup-by-name → id; on miss, the row is rejected, not the master row created. Code-review the create + update paths to confirm no `.insert(...)` against these tables exists in this file.

Also fetch the missing lookup queries that aren't currently loaded (`sub_branches`, `locations`, `pms_grades`, `levels`) via React Query, mirroring the existing `departments`/`divisions`/`businessUnits`/`designations` hooks.

### 4. UX: surface the policy
Add a soft info banner above the employee upload card:
> "Existing `employeeCode` rows will be updated in place. Division, Business Unit, Department, Sub-Branch, Location, Designation, PMS Grade and Level values must already exist in master data — unknown values are rejected and never auto-created."

### 5. Tests (`src/lib/employeeImportValidation.test.ts`)
Extract the per-row predicate into `validateEmployeeRow(row, lookups)` and cover:
- existing code → no error (silent update)
- unknown department / division / BU / sub-branch / location / designation / PMS grade / level → one precise error each
- valid new code with all master refs resolvable → no error
- missing code + name → error
- invalid email → error

## Documentation & Policy Sync
- `DOCUMENTATION.md` → Import Data section: document the upsert-by-`employeeCode` behaviour and the full list of validated master-data fields.
- `POLICY.md`: "Employee import silently updates existing employees. Master-data values (Divisions, Business Units, Departments, Sub-Branches, Locations, Designations, PMS Grades, Levels) must pre-exist and are never auto-created from employee imports."

## Out of Scope
- Edge-function-based create path for new employees (unchanged).
- KRA/KPI import sheets (unchanged).
- Master-data CRUD UI (already exists in Org Structure tabs).
