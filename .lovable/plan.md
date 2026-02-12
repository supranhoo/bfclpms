

# Fix: KPI Edit Not Updating + KRA Dropdown Empty

## Issue 1: KPI Edit from "KPI Details" Not Updating

**Root Cause**: In `KpiLogicModal.tsx`, after saving edits, the modal calls `setIsEditing(false)` and shows the `kpi` prop -- but this prop comes from the parent's `useState` (`selectedKpiLogic`), which still holds the **old** KPI object. Query invalidation refreshes the list data, but the parent state variable is never updated with the new values.

**Fix**: After a successful save, close the modal entirely so the user sees refreshed data when they reopen it. Alternatively, update the displayed values from `editData` after save succeeds. The simplest and most reliable fix is to call `onClose()` after save.

### File: `src/components/dashboard/KpiLogicModal.tsx`
- In `onSuccess` callback (line 74-78): add `onClose()` after `setIsEditing(false)` so the modal closes with a success toast, and reopening it will show fresh data from the re-fetched query.

---

## Issue 2: KRA Dropdown Shows "No KRA names found"

**Root Cause**: The `kpi_templates` table is **completely empty** (0 rows). The dropdown filter queries only from `kpi_templates`, so every category returns zero results.

**Fix**: Add a fallback data source. When no templates exist for the selected category, derive unique KRA and KPI names from the **existing `kpis` table** (already fetched via `useAllKpis` or a new lightweight query). This ensures admins always see previously used KRA/KPI names even without a populated template library.

### File: `src/components/admin/AdminKpiCreateDialog.tsx`
- Add a new hook call: `useAllKpis()` to get existing KPI data
- Update `filteredKraNames` memo: if templates return no results for the selected category, fall back to unique KRA names from existing KPIs with the same `category_id`
- Update `filteredKpiTemplates` memo: similarly fall back to existing KPIs matching category + KRA name
- When selecting a KPI from the fallback (existing KPIs, not templates), auto-fill available fields (target, UOM, thresholds, etc.) from that existing KPI

### File: `DOCUMENTATION.md`
- Document the fallback behavior

---

## Summary

| Aspect | Detail |
|--------|--------|
| Files changed | 3 |
| Database changes | None |
| Risk | Low -- closing modal on save is standard UX; fallback to existing KPIs is additive |

## Technical Detail

For the KRA dropdown fallback, the cascading logic becomes:

```text
Category selected
  --> Check kpi_templates for KRA names
  --> If none found, use unique KRA names from existing kpis table
    --> KRA selected
      --> Check kpi_templates for KPI names
      --> If none found, use existing kpis with same category + KRA
        --> KPI selected --> auto-fill from template or existing KPI
```

