

## Fix: All Program Names Not Shown in Production Data Dropdown

### Root Cause
The **ProductionTargetGrid** filters programs with `p.program_type !== 'support'`. This relies on the `program_type` column matching specific string values. However, `program_type` stores a dynamic slug (e.g., `plant_incentive`, `production_maintenance`) from the `incentive_program_types` table — not a standardized value.

If a program was created with a custom type or if the `program_type` column is null/empty, the filter still passes. But if a program has `is_active = false` or if the `program_type` is literally `'support'`, it gets excluded.

More critically, the **VesselDataEntryGrid** only shows programs where `incentive_base === 'fixed'` — so non-fixed programs are intentionally excluded there.

The real issue is likely that some programs have `is_active` set to `false`, or the `program_type` field is set to `'support'` when it shouldn't be.

### Fix
1. **ProductionTargetGrid**: Remove the `program_type !== 'support'` filter — show **all active programs** in the dropdown, since production data can apply to any program type
2. **VesselDataEntryGrid**: Keep the `incentive_base === 'fixed'` filter (only vessel-rate programs need vessel entry), but this is already correct

### Files Changed
| File | Action |
|------|--------|
| `src/components/incentive/ProductionTargetGrid.tsx` | Change filter from `p.program_type !== 'support' && p.is_active` to just `p.is_active` |

### Risk Assessment
- **Regression**: Zero — support programs will now appear in the dropdown but that's correct since admins should be able to enter production data for any program
- **Data**: No schema changes
- **Security**: No change

