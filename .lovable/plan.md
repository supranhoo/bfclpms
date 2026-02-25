

# Show Target Employee on Org KPI Observations (v1.46.5)

## Problem

In the "Employee Observations" section of the Org KPI Data Entry card, observations are grouped by **who raised** them (the observer), but there's no clear indication of **which employee** the observation was raised **for**. Since Org KPIs span all employees, it's critical to show the target employee.

## Solution

Join through the `kpis` table to fetch the target employee's profile, then group observations by the **target employee** (KPI owner) instead of the observer. The observer name will still be shown inline on each observation row.

## Technical Changes

### 1. Update `useObservationsByKpis` hook (`src/hooks/useKpiObservations.ts`)

Add a nested join through the `kpis` table to fetch the target employee profile:

```typescript
// Current select:
.select(`*, created_by_profile:..., reviewed_by_profile:...`)

// Updated select adds:
kpi:kpis!kpi_observations_kpi_id_fkey(employee_id, employee_profile:profiles!kpis_employee_id_fkey(full_name, email))
```

Update the `KpiObservation` interface to include the joined employee data:
```typescript
kpi?: {
  employee_id: string;
  employee_profile?: { full_name: string | null; email: string };
};
```

### 2. Update `OrgKpiObservationsSummary` component (`src/components/admin/OrgKpiObservationsSummary.tsx`)

Change grouping logic from `created_by` to the target employee (`kpi.employee_id`):

- Group key: `obs.kpi?.employee_id` instead of `obs.created_by`
- Group name: `obs.kpi?.employee_profile?.full_name` instead of `obs.created_by_profile?.full_name`
- Each observation row label changes from showing the observer name (redundant with group header) to showing: "Raised by: [observer name]" with the `observer_role` badge

This way each group header clearly shows **"Debadutta Sahoo - 2 observations"** (the person it's about), and inside each row you see **"Raised by: Jaspal (manager)"**.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only join, no schema changes |
| Regression | Very low | Only affects Org KPI observation summary display |
| Query performance | Minimal | Single additional join on indexed FK |

