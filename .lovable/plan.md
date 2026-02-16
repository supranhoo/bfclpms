

# Fix: Show All Org-Level KPIs in Data Owners Tab

## Problem

The "Data Owners" tab only shows org-level KPIs that have at least 1 employee mapped in the selected review period. KPIs marked as org-level but not yet assigned to any employees are hidden, preventing admins from assigning data owners to them.

## Root Cause

`kpiDefinitions` is built from `ownershipFilteredKpis`, which derives from `useOrgLevelKpisWithEmployees` -- a hook that intentionally filters out unmapped KPIs (for the Data Entry tab, this makes sense). But the Data Owners tab needs all org-level KPIs.

## Solution

Use the existing `useOrgLevelKpis` hook (which returns ALL org-level KPIs without employee filtering) to build a separate `allKpiDefinitions` list specifically for the Data Owners tab.

### File: `src/pages/admin/OrgKpiDataEntry.tsx`

1. Import and call `useOrgLevelKpis` (already exists in `useOrgLevelKpis.ts`)
2. Create `allKpiDefinitions` memo from this unfiltered data
3. Pass `allKpiDefinitions` to `OrgKpiOwnerManagement` instead of `kpiDefinitions`

```typescript
// Add to existing data queries
const { data: allOrgLevelKpis } = useOrgLevelKpis(selectedPeriod, selectedYear);

// Build definitions for owner management (ALL org-level KPIs, no employee filter)
const allKpiDefinitions = useMemo(() => {
  if (!allOrgLevelKpis) return [];
  return allOrgLevelKpis.map(kpi => ({
    categoryId: kpi.category_id,
    categoryName: kpi.kra_categories?.name || '',
    categoryColor: kpi.kra_categories?.color || '#6B7280',
    kraName: kpi.kra_name,
    kpiName: kpi.kpi_name,
  }));
}, [allOrgLevelKpis]);

// Then pass to component:
<OrgKpiOwnerManagement kpiDefinitions={allKpiDefinitions} />
```

### File: `DOCUMENTATION.md`

Update to note that the Data Owners tab shows all org-level KPIs regardless of employee mapping.

## Technical Details

| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Import `useOrgLevelKpis`, create `allKpiDefinitions`, pass to `OrgKpiOwnerManagement` |
| `DOCUMENTATION.md` | Document the behavior |

No database or schema changes needed. The `useOrgLevelKpis` hook already exists and fetches all org-level KPIs without the employee mapping filter.

