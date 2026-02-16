

# Prominent Org KPI + Data Owner Badge for Reviewers

## Problem
Currently, org-level KPIs are only indicated by a tiny scope icon (Building2/Users/User) with a tooltip in the KPI table. Reviewers at the next level have no clear, at-a-glance indicator that a KPI's data was entered by a designated Data Owner, nor who that person is.

## Solution
Add a visible, colored badge on org-level KPIs across the dashboard, review panels, and mobile cards showing:
- **"Org KPI"** label with scope context
- **"Data by [Owner Name]"** showing who entered the value

This information will be sourced from the existing `entered_by` field on `org_kpi_values` (which stores the data owner's name).

## Changes

### 1. Expand `orgKpiValuesMap` to include `entered_by`
**Files**: `src/pages/Dashboard.tsx`, `src/components/review/EmployeeScorecard.tsx`, `src/components/review/UnifiedScorecard.tsx`, `src/components/review/AuditScorecard.tsx`, `src/components/review/ManagementScorecard.tsx`

- Update the map type from `{ achieved_value, data_source }` to `{ achieved_value, data_source, entered_by }` 
- Include the `entered_by` field when building the lookup map

### 2. Update `getOrgKpiValue` return type
**File**: `src/components/review/KpiDetailsTable.tsx`

- Extend the `getOrgKpiValue` prop type to include `entered_by: string | null`

### 3. Add Org KPI badge to `KpiDetailsTable.tsx`
In the KRA/KPI name column, below the existing content, show a compact badge row for org-level KPIs:
- A teal/indigo "Org KPI" badge with the scope (Org/Dept/Individual)
- A secondary badge: "Data by [entered_by name]" when available

### 4. Add Org KPI badge to `KpiHeaderSection.tsx`
In the review panel header (shown when a reviewer opens a KPI for detailed review):
- Add a prominent badge row below the existing badges showing "Organization KPI" and "Data entered by [Name]"

### 5. Add Org KPI badge to `MobileKpiCard.tsx`
- Update the `getOrgKpiValue` prop type to include `entered_by`
- Show a compact badge below the category pill for org-level KPIs

### 6. Update `DOCUMENTATION.md`
- Document the org KPI data owner visibility feature

## Technical Details

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Include `entered_by` in orgKpiValuesMap |
| `src/components/review/EmployeeScorecard.tsx` | Include `entered_by` in orgKpiValuesMap |
| `src/components/review/UnifiedScorecard.tsx` | Include `entered_by` in orgKpiValuesMap |
| `src/components/review/AuditScorecard.tsx` | Include `entered_by` in orgKpiValuesMap |
| `src/components/review/ManagementScorecard.tsx` | Include `entered_by` in orgKpiValuesMap |
| `src/components/review/KpiDetailsTable.tsx` | Update prop type, add org KPI + data owner badges |
| `src/components/review/KpiHeaderSection.tsx` | Add org KPI badge with data owner name to review panel |
| `src/components/dashboard/MobileKpiCard.tsx` | Update prop type, add org KPI badge |
| `DOCUMENTATION.md` | Document feature |

## Visual Example

In the KPI table row, the KRA/KPI column will show:

```text
Revenue Growth (KRA name)
Quarterly revenue target (KPI name)
[Org KPI - Organization]  [Data by: John Smith]
```

In the review panel header:

```text
[Sales] [Approved] [January 2026] [10%] [Timeline]
[Building icon] Organization KPI  |  Data entered by: John Smith
Revenue Growth
Quarterly revenue target
```

