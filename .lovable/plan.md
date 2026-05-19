# Add "Employee Status" column to Employee Bulk Import

Adds an `employeeStatus` (Active / Inactive) column to the Employee Bulk Import workflow on Admin → Import Data, backed by the existing `profiles.is_active` boolean. Keeps the Zero-Hardcoding rule: status values are normalized through a tiny mapper, not scattered string literals.

## Scope (single file + one edge function tweak)

### 1. `src/pages/admin/ImportData.tsx`

- **`EmployeeImportRow` interface** — add `employeeStatus?: string`.
- **`downloadEmployeeTemplate()`** — append `employeeStatus: 'Active'` to the sample row so the column appears in the generated XLSX.
- **`exportEmployeeData()`**
  - Include `is_active` in the `profiles` select.
  - Add `employeeStatus: profile.is_active === false ? 'Inactive' : 'Active'` to each export row (column placed right after `role` for visibility).
- **`normalizeEmployeeRow()`** — add `employeeStatus: getValue(['employeeStatus','employee_status','status','active','isActive','is_active'])`.
- **Validation pass** (in `handleEmployeeFileUpload`) — if value provided, must normalize to Active/Inactive (accepts `active|inactive|yes|no|true|false|1|0`), else push row error.
- **`processEmployee()`**
  - Helper `parseStatus(val) → boolean | undefined` (undefined ⇒ leave untouched).
  - **Update path**: include `is_active` in the `profiles.update({...})` payload when provided.
  - **Create path**: pass `is_active` in the `create-employee` invoke body when provided.

### 2. `supabase/functions/create-employee/index.ts`

- Accept optional `is_active: boolean` in the request body and forward it into the `profiles` insert (defaults to `true` if omitted, preserving current behavior).

## Behavior

| Input cell | Stored `is_active` |
|---|---|
| empty / missing column | unchanged (update) or `true` (create) |
| Active / Yes / True / 1 | `true` |
| Inactive / No / False / 0 | `false` |
| anything else | row-level validation error |

Deactivating via import will fire the existing `iac_leaver_revoke` trigger, which already revokes portal access — no extra wiring needed.

## Risk & Impact

- **Data**: no schema change. Uses existing `profiles.is_active`. Existing exports gain one new column (additive, non-breaking for downstream consumers that key by column name).
- **Workflow**: bulk import can now flip active status. Guarded by the same RLS the rest of `processEmployee` already relies on (admin-only page).
- **Security**: status changes go through the same admin path; trigger-based access revocation handles deactivation side-effects.
- **Regression**: minimal — additive column on template/export, optional field on import. Existing import files without the column behave exactly as today.

## Tests (new + updated)

- `src/lib/importValidation.test.ts` (or new `employeeStatusParsing.test.ts`):
  - parses Active/Inactive variants correctly
  - rejects garbage values
  - empty value ⇒ undefined (no overwrite)
- Update existing employee-import mock fixtures to include the new column.

## Docs

- `DOCUMENTATION.md` → Import Data section: document new column + accepted values.
- `POLICY.md` → note that bulk import can now toggle employee active status (admin-only).
- Add Version History entry.

## Out of scope

- No UI changes outside the Import Data page.
- No changes to single-employee create/edit forms.
- No bulk-status-only tool (separate workflow).
