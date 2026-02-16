

# Add Admin-Only Features to Org KPI Data Entry

## Overview

Add three admin-only capabilities to the Org KPI Data Entry page:
1. **Remove KPI from Org KPI** -- unmark a KPI as organization-level directly from the data entry card
2. **Restrict bulk actions to admin only** -- Copy from Last Period, Export Template, and Import Excel buttons should only be visible to admins (currently visible to all data owners)

---

## Feature 1: Remove KPI from Org KPI

Add a "Remove from Org KPI" button on each KPI card (admin-only) that sets `is_org_level = false` on all matching KPI records for that period.

### Implementation

**New hook: `useUnmarkAsOrgLevel`** in `src/hooks/useMarkAsOrgLevel.ts`
- Adds a mutation that sets `is_org_level = false` and clears `org_level_scope` on all matching KPI records
- Also deletes any associated `org_kpi_values` and `org_kpi_data_owners` records for cleanup
- Requires confirmation dialog with KPI name shown

**UI Changes in `src/components/admin/OrgKpiEntryCard.tsx`:**
- Add an optional `onRemoveFromOrg` callback prop
- Show a trash/X icon button with "Remove from Org KPI" tooltip (admin only)
- Wrapped in an AlertDialog for confirmation since this is destructive

**Wire up in `src/pages/admin/OrgKpiDataEntry.tsx`:**
- Create handler that calls the unmark mutation
- Pass `onRemoveFromOrg` to each `OrgKpiEntryCard` only when `isAdmin` is true
- Invalidate relevant queries after removal

## Feature 2: Admin-Only Bulk Actions

The "Copy from Last Period", "Export Template", and "Import Excel" buttons are currently visible to all users (including data owners). These should be restricted to admins only.

### Implementation

**In `src/pages/admin/OrgKpiDataEntry.tsx`:**
- Wrap the three bulk action buttons in a conditional: `{isAdmin && (...)}`
- Data owners will still see the search bar and period selector but not the bulk tools

---

## Technical Details

### Files to Change

| File | Change |
|---|---|
| `src/hooks/useMarkAsOrgLevel.ts` | Add `useUnmarkAsOrgLevel` mutation (set `is_org_level = false`, cleanup related data) |
| `src/components/admin/OrgKpiEntryCard.tsx` | Add `onRemoveFromOrg` prop with confirmation dialog and trash button (admin only) |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Wire up remove handler; wrap Copy/Export/Import in `isAdmin` guard |
| `DOCUMENTATION.md` | Document new admin-only features |

### Unmark Mutation Logic

```typescript
// In useMarkAsOrgLevel.ts
export function useUnmarkAsOrgLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, kraName, kpiName, reviewPeriod, reviewYear }) => {
      // 1. Set is_org_level = false on all matching KPI records
      await supabase.from('kpis')
        .update({ is_org_level: false, org_level_scope: null })
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true);

      // 2. Delete org_kpi_values for this KPI+period
      await supabase.from('org_kpi_values')
        .delete()
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      // 3. Delete data owner assignments
      await supabase.from('org_kpi_data_owners')
        .delete()
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owners'] });
    },
  });
}
```

### Entry Card Remove Button (admin only)

A small destructive icon button in the card's action row, wrapped in an AlertDialog:
- Shows KPI name in confirmation
- Warns that this removes the KPI from org-level tracking
- Only visible when `isAdmin && !isPropagated` (propagated KPIs must be rolled back first)

### Admin-Only Bulk Actions

The existing buttons at lines 640-649 will be wrapped:
```tsx
{isAdmin && (
  <div className="flex gap-2 flex-wrap">
    <Button ...>Copy from Last Period</Button>
    <OrgKpiBulkExport ... />
    <Button ...>Import Excel</Button>
  </div>
)}
```

