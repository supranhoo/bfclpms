

# Org KPI Inline Management Actions

## What You're Getting

Right now, to change an Org KPI's level or add/remove employees, you have to go to Admin > All KRAs and edit each KPI individually. This plan adds management actions **directly** on the Org KPI Overview page so you can:

1. **Change Org Level** -- Toggle a KPI's org-level flag on/off, or change its scope (Organization / Department / Employee) right from the Mapping tab
2. **Remove Employee** -- Unlink an employee from an Org KPI with one click (removes the `is_org_level` flag from that specific employee's KPI record)
3. **Add Employee** -- Assign an Org KPI to additional employees who don't have it yet, directly from the Mapping view
4. **Bulk Actions** -- Select multiple employees to add/remove at once

---

## UI Changes

### Mapping Tab -- "By KPI" View

Each KPI card header gets:
- A **scope badge** showing current scope (Organization / Department / Employee) that opens a dropdown to change scope
- An **"Add Employee"** button that opens a dialog to pick employees

Each employee row in the table gets:
- A **Remove** button (trash icon) to unlink that employee from this Org KPI

### Mapping Tab -- "By Employee" View

Each employee row gets:
- A **Remove** button per KPI badge to unlink individual KPIs

### New Dialog: "Add Employee to Org KPI"

- Searchable multi-select list of employees not currently mapped to this KPI
- Filters: Department, Division
- Shows employee name, code, department
- "Add Selected" button creates new KPI records for chosen employees with `is_org_level = true`

### Confirmation Dialogs

- Removing an employee shows a confirmation: "This will remove [Employee] from [KPI Name]. Their existing submission data will remain but will no longer be linked to org-level scoring."
- Changing scope shows an impact warning: "Changing scope from Organization to Department will require separate values per department."

---

## Technical Details

### New Files

| File | Purpose |
|------|---------|
| `src/components/admin/OrgKpiAddEmployeeDialog.tsx` | Dialog to add employees to an Org KPI |
| `src/hooks/useOrgKpiManagement.ts` | Hook with mutations: `addEmployeesToOrgKpi`, `removeEmployeeFromOrgKpi`, `changeOrgKpiScope` |

### Modified Files

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiMappingDashboard.tsx` | Add action buttons (Add Employee, Remove, Scope Change) to "By KPI" and "By Employee" views |
| `src/pages/admin/OrgKpiOverview.tsx` | Pass refresh callback to Mapping component |
| `DOCUMENTATION.md` | Document new management actions |

### Hook Logic: `useOrgKpiManagement.ts`

**`addEmployeesToOrgKpi`** mutation:
- For each selected employee, check if they already have a KPI record with the same `category_id`, `kra_name`, `kpi_name`, `review_period`, `review_year`
- If yes: update `is_org_level = true` on the existing record
- If no: insert a new KPI record copying properties (target, thresholds, weightage, etc.) from an existing org-level KPI record, with `is_org_level = true`

**`removeEmployeeFromOrgKpi`** mutation:
- Set `is_org_level = false` on the employee's KPI record (does **not** delete the KPI -- preserves their data)
- Optionally: fully delete the KPI record if admin confirms (with a checkbox "Also delete KPI and submission data")

**`changeOrgKpiScope`** mutation:
- Update `org_level_scope` on all KPI records matching the `category_id`, `kra_name`, `kpi_name`, `review_period`, `review_year` where `is_org_level = true`
- Batch update using a single query

### Add Employee Dialog Logic

```
1. Fetch all profiles (employees)
2. Fetch existing KPI records for this org KPI (category_id + kra_name + kpi_name + period + year)
3. Filter out employees who already have is_org_level = true
4. Show remaining employees in a searchable, multi-select list
5. On "Add Selected": create/update KPI records with is_org_level = true
```

### No Database Migrations Needed

All operations use existing columns (`is_org_level`, `org_level_scope`) on the `kpis` table. No schema changes required.

---

## Expected Result

- Admins can manage Org KPI assignments directly from the Mapping tab without navigating away
- Scope changes propagate to all matching KPI records in one action
- Employee additions copy KPI configuration (thresholds, targets, weights) from existing records
- Removals preserve employee data by default (just clears the org-level flag)
- All changes are immediately reflected in the Mapping dashboard counts and tables

