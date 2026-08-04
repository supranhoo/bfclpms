---
name: Employee Master column parity (ADR-247)
description: Every master attribute + custom field must be viewable via the User Management Columns chooser and importable/exportable with the same header alias
type: feature
---
- SSOT: `src/lib/employeeMasterColumns.ts` (optional grid columns, localStorage persistence, import doc mapping).
- Grid: `UserManagement.tsx` "Columns" chooser; extras hydrated per page by `useEmployeeMasterRowExtras` — never widen `get_reviewer_roster_slim`.
- Import/Export (`ImportData.tsx`): `mobileNumber`, `isDummyEmployee`, `portalAccess` and one column per active custom field (header = field_key or label). Template, export headers and on-screen docs all derive from the same list.
- Custom-field uploads MERGE into the existing `employee_master_custom_field_values.values` JSONB — a partial sheet must never wipe untouched fields.
- Adding a new master attribute requires updating both the column SSOT and importer aliases in the same change (POLICY §EMP-MASTER-COLUMN-PARITY).
- Regression: `src/test/employeeMasterColumnParity.test.ts`.
