

# Org KPI Pending Data Report (v1.45.98)

## Overview

Add a "Download Pending Report" button to the Organization KPI Data Entry page that generates a comprehensive Excel report showing all pending KPIs -- what needs to be uploaded, for which employees/departments, and who the assigned data provider is.

## Report Columns

The report will include all export template columns plus pending-specific intelligence:

| Column | Source | Purpose |
|--------|--------|---------|
| Category | kra_categories.name | Group identification |
| KRA | kpi.kra_name | KRA identification |
| KPI Name | kpi.kpi_name | KPI identification |
| Target | kpi.target_value | Reference for data entry |
| UOM | kpi.uom | Unit of measure |
| Scope | kpi.org_level_scope | Organization / Department / Employee |
| Status | existingValuesMap | Pending / Entered / Propagated |
| Department | department name (for dept/emp scope) | Who it's pending for |
| Employee | employee name (for emp scope) | Who it's pending for |
| Employee Code | employee code (for emp scope) | Quick identification |
| Achieved Value | org_kpi_values | Current value (blank if pending) |
| Remark | org_kpi_values | Current remark |
| Data Owner(s) | ownershipMap | Who is responsible for uploading |
| Data Owner Email(s) | ownershipMap | Contact info for follow-up |
| R5 / R4 / R3 / R2 / R1 | rating thresholds | Reference for scoring |
| Frequency | kpi.frequency | Entry cadence |
| Previous Period Value | prevValuesMap | Historical reference |

## Additional Inputs (My Brainstorming Additions)

1. **Days Pending**: For KPIs with status "pending", calculate how many days into the current period we are -- helps prioritize urgency.
2. **Employee Count**: For org/dept scope KPIs, show how many employees will be affected once propagated -- helps prioritize high-impact KPIs.
3. **Two Sheets**: Sheet 1 = "Pending Only" (filtered to status = pending), Sheet 2 = "Full Status" (all KPIs with their status). This way the report serves both as a quick action list and a complete overview.
4. **Summary Row at Top**: A header section showing total KPIs, pending count, entered count, propagated count, and completion percentage.
5. **Color-coded Status**: Excel conditional formatting on the Status column (red = Pending, yellow = Entered, green = Propagated).

## Technical Changes

### 1. New Component: `src/components/admin/OrgKpiPendingReport.tsx`

A button component that accepts:
- All org-level KPIs with their status, scope, and values
- Ownership map (data owners per KPI)
- Department and employee mappings
- Previous period values
- Selected period/year

On click, it generates a multi-sheet Excel workbook using the `xlsx` library (already installed).

### 2. `src/pages/admin/OrgKpiDataEntry.tsx`

- Build a `pendingReportData` memo that assembles all rows with status, scope breakdowns, and data owner names
- Add the `OrgKpiPendingReport` button next to the existing "Export Template" and "Import Excel" buttons in the admin toolbar (line ~714-724)
- Pass ownership map, departments, profiles, employee count map, and previous values to the report component

### 3. Report Generation Logic

For each org-level KPI:
- **Organization scope**: One row showing the KPI status and data owner(s)
- **Department scope**: One row PER mapped department, each showing its own status (value entered or not) and the data owner(s)
- **Employee scope**: One row PER mapped employee, showing individual status and data owner(s)

This granular breakdown ensures the report answers "exactly what is pending and for whom."

### 4. `DOCUMENTATION.md`

Bump to v1.45.98. Document the pending report feature and its column definitions.

## UI Placement

The button will appear in the admin toolbar alongside "Copy from Last Period", "Export Template", and "Import Excel":

```
[Copy from Last Period] [Export Template] [Download Pending Report] [Import Excel]
```

It will use a `FileBarChart` icon to distinguish it from the template export. Available to admins only (consistent with other bulk tools).

## No Database Changes

All data needed is already fetched by existing hooks. The report is generated entirely client-side from:
- `frequencyFilteredKpis` (KPI definitions)
- `existingValuesMap` (current values and statuses)
- `ownershipMap` (data owners)
- `departments` and `allProfiles` (scope targets)
- `prevValuesMap` (historical reference)
- `mappedDepartmentsMap` / `mappedEmployeesMap` (scope mappings)

