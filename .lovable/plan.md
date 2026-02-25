

# Show Observation Counts per Employee Row in Scoped Entry Table (v1.46.7)

## Overview

Add a compact observation count badge next to the employee's designation in the Org KPI scoped entry table. For example: "Assistant General Manager **(Positive: 1, Concern: 2)**". This provides immediate visibility into existing feedback without needing to scroll to the observations summary panel.

## Visual Result

Each employee row currently shows:
```
K Srinivasa Rao
[1050 TPD-E And I] [Assistant General Manager]
```

After this change, if the employee has observations:
```
K Srinivasa Rao
[1050 TPD-E And I] [Assistant General Manager] [Positive: 1] [Concern: 2]
```

The counts will appear as small colored badges (green for positive, red for concern, gray for neutral) -- only shown when count > 0.

## Technical Changes

### 1. Update `ScopedRow` interface and `OrgKpiScopedEntryTable` props

**File: `src/components/admin/OrgKpiScopedEntryTable.tsx`**

- Add an optional `observationCounts` prop to the table: a map from scopeId to `{ positive: number; concern: number; neutral: number }`.
- In `EmployeeRow`, read the counts for the current `row.scopeId` and render small badges next to the designation badge.
- Import `TrendingUp` and `TrendingDown` icons from lucide for visual consistency with the observations summary.

### 2. Compute observation counts in `OrgKpiEntryCard`

**File: `src/components/admin/OrgKpiEntryCard.tsx`**

- Import `useObservationsByKpis` from `@/hooks/useKpiObservations`.
- Call `useObservationsByKpis(employeeKpiIds || [])` to fetch all observations for employee-scoped KPIs (this data is already fetched for the `OrgKpiObservationsSummary` component, but since that's a separate component, we need it here too -- React Query will deduplicate the request via caching).
- Build a `Map<string, { positive: number; concern: number; neutral: number }>` keyed by employee ID by iterating through the observation map and using `obs.kpi?.employee_id`.
- Pass this map as the `observationCounts` prop to `OrgKpiScopedEntryTable`.

### 3. No database or hook changes needed

The `useObservationsByKpis` hook already fetches `kpi.employee_id` (added in v1.46.5), so no backend changes are required.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only display, no writes |
| Query performance | None | React Query deduplicates the request already made by OrgKpiObservationsSummary |
| Regression | Very low | Additive badges only, existing row layout untouched |
| UI consistency | Good | Uses same color scheme as observation summary badges |

