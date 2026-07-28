---
name: Bulk Review multi-select filter parity
description: Multi-select filters whose RPC is single-valued must be re-applied client-side (Company/Division/BU/Dept via rpc_bulk_employee_attrs)
type: feature
---
ADR-195 / POLICY §UI-MULTISELECT-SERVER-PARITY.

- `bulk_scope_preview` / `bulk_review_snapshot` accept ONE value per axis; the dashboard uses `oneOrNull()` and sends `null` for 2+ selections (= full scope). Any such axis MUST have a client-side counterpart over `rawRows` or the filter is a silent no-op.
- Org axes resolve through `rpc_bulk_employee_attrs`, which returns `company_id`, `department_id`, `business_unit_id`, `division_id` (BU/division via `departments → business_units → divisions`; `profiles` has only department_id + company_id).
- Helpers: `allowedOrgEmployeeIds()` / `hasOrgFilter()` in `src/lib/bulkEmployeeFilter.ts`. AND across axes, OR within; NULL attribute = excluded when that axis is active; fail-closed while attrs hydrate.
- Preview counters show `~` when any axis has 2+ values.
- Regression: `src/lib/bulkOrgFilter.test.ts`.
