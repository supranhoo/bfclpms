

# Fix: Include KPI Name and KRA Name in Bulk Apply Propagation

## Problem
When an admin edits the KPI name (or KRA name) and selects "All months" or "All future months", the text change only applies to the current month. The sibling months retain the old name.

This happens because the `structuralFields` object (line 147-168 of `AdminKpiEditDialog.tsx`) excludes `kra_name` and `kpi_name` — these are only sent in the primary update (line 175-176) but not in the batch sibling update (line 225).

## Fix

### File: `src/components/admin/AdminKpiEditDialog.tsx`

**1. Add `kra_name` and `kpi_name` to the `structuralFields` object** (after line 148):

```typescript
const structuralFields = {
  kra_name: formData.kra_name,
  kpi_name: formData.kpi_name,
  target_value: ...
  // rest unchanged
};
```

**2. Update the sibling query to use the ORIGINAL KPI name** (not the new one):

The sibling lookup (around line 196) currently matches on `kpi.kpi_name` which is the original KPI object. This is already correct — we match siblings by the old name, then update them to the new name. No change needed here.

**3. Handle the unique constraint**: The `idx_kpis_no_duplicates` constraint is on `(employee_id, review_period, review_year, kra_name, kpi_name)`. Since we're renaming from the old name to the new name for the same employee/period/year, each sibling update replaces the old name — no conflict arises unless a KPI with the new name already exists for that month. We should add error handling to catch and report this.

## Risk Assessment
- **Data Impact**: KPI name/KRA name will now propagate like other structural fields. This is the expected behavior.
- **Unique Constraint**: If the new name collides with an existing KPI in a sibling month, the update will fail for that sibling only (already handled by the `continue` on line 230). A toast will inform the admin.
- **Regression Risk**: Low — only adds two more fields to an existing propagation mechanism.

