

# Unified Rollback Records Lobby with Export

## Current State

The Rollback Requests page (`/admin/rollback-requests`) currently only shows **employee-initiated KPI status rollback requests** from the `kpi_rollback_requests` table. It does NOT show **admin-initiated Org KPI propagation rollbacks** which are logged in `org_kpi_data_entry_logs` (with actions `rollback_to_data_entry` and `bulk_rollback_to_data_entry`).

These are two completely different rollback types:
1. **KPI Status Rollbacks** -- employees request to revert their KPI status (e.g., manager_review back to self_review). Stored in `kpi_rollback_requests`.
2. **Org KPI Propagation Rollbacks** -- admins reverse propagated org-level values back to data entry. Logged in `org_kpi_data_entry_logs`.

## Plan

### 1. Add "Org KPI Rollbacks" Tab

Convert the page into a tabbed layout with two sections:
- **Tab 1: "KPI Status Requests"** -- the existing table (unchanged functionality)
- **Tab 2: "Org KPI Rollbacks"** -- new table showing admin-initiated propagation rollbacks from `org_kpi_data_entry_logs`

The Org KPI Rollbacks tab will show:
- KPI Name, KRA, Category, Review Period/Year
- Performed By (admin name)
- Old Value (before rollback)
- Reason/Remarks
- Date
- Action type badge (Single Rollback vs Bulk Rollback)

### 2. Update Stats Cards

Add a 5th stat card for "Org KPI Rollbacks" count, pulling from `org_kpi_data_entry_logs` where action contains 'rollback'. The existing 4 cards (Pending/Approved/Rejected/Expired) remain and apply only to the KPI Status Requests tab.

### 3. Excel Export Button

Add a "Download Report" button in the header area that exports the **currently visible data** (whichever tab + filter is active) to an Excel file using the existing `xlsx` library. Columns will match the table layout.

For KPI Status Requests tab:
- Requester Name, Requester Code, Employee Name, Employee Code, KPI, KRA, Period, Year, From Status, To Status, Reason, Request Date, Status, Actioned Date

For Org KPI Rollbacks tab:
- KPI Name, KRA, Review Period, Year, Action Type, Performed By, Old Value, Reason, Date

### 4. New Hook for Org KPI Rollback Logs

Create a query in `useAllRollbackRequests.ts` to fetch rollback entries from `org_kpi_data_entry_logs` where `action IN ('rollback_to_data_entry', 'bulk_rollback_to_data_entry')`, joined with `profiles` for the performer's name.

## Technical Details

### File 1: `src/hooks/useAllRollbackRequests.ts`

- Add new interface `OrgKpiRollbackLog` with fields: id, category_id, kra_name, kpi_name, review_period, review_year, action, performed_by, old_value, new_value, remarks, created_at, performer (full_name, employee_code)
- Add new hook `useOrgKpiRollbackLogs()` that queries `org_kpi_data_entry_logs` filtered to rollback actions, joined with `profiles` for performer info, ordered by `created_at DESC`
- Add `useOrgKpiRollbackCount()` for the stats card

### File 2: `src/pages/admin/RollbackRequests.tsx`

- Import `Tabs, TabsList, TabsTrigger, TabsContent` from shadcn
- Wrap existing table in a `TabsContent value="kpi-status"`
- Add second `TabsContent value="org-kpi"` with the Org KPI rollback table
- Add a 5th stats card "Org Rollbacks" showing the count
- Add "Download Report" button next to the search bar using `xlsx` library
- Export function maps the currently filtered data to Excel rows based on active tab

### File 3: `DOCUMENTATION.md`

- Version bump to 1.45.56
- Document unified rollback lobby and export capability

## No Database Changes Required

Both data sources already exist:
- `kpi_rollback_requests` -- SELECT policy is `true` for authenticated users
- `org_kpi_data_entry_logs` -- needs RLS check

### RLS Check for `org_kpi_data_entry_logs`

Will verify the existing RLS policy allows admin SELECT access. If not, a migration will be needed to add an admin read policy.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useAllRollbackRequests.ts` | Add `useOrgKpiRollbackLogs` and `useOrgKpiRollbackCount` hooks |
| `src/pages/admin/RollbackRequests.tsx` | Add tabs, Org KPI rollback table, Excel export button |
| `DOCUMENTATION.md` | Version bump + changelog |

